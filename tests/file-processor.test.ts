import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { FileProcessor, FileType } from "../src/services/file-processor";
import { OpenAIEmbeddings } from "@langchain/openai";
import * as fs from "fs/promises";
import * as path from "path";

const TEST_UPLOAD_DIR = "./tests/temp_uploads";

describe("FileProcessor", () => {
    let processor: FileProcessor;

    beforeAll(async () => {
        // Clean up any existing test directory
        try {
            await fs.rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
        } catch {}

        processor = new FileProcessor({
            uploadDir: TEST_UPLOAD_DIR,
            chunkSize: 100,
            chunkOverlap: 20,
        });
        await processor.initialize();
    });

    afterAll(async () => {
        // Clean up test directory
        try {
            await fs.rm(TEST_UPLOAD_DIR, { recursive: true, force: true });
        } catch {}
    });

    it("should initialize upload directory", async () => {
        const stats = await fs.stat(TEST_UPLOAD_DIR);
        expect(stats.isDirectory()).toBe(true);
    });

    it("should detect file types correctly", () => {
        // Accessing private method via any for testing
        const p = processor as any;
        expect(p.detectFileType("test.txt")).toBe(FileType.TEXT);
        expect(p.detectFileType("test.md")).toBe(FileType.MARKDOWN);
        expect(p.detectFileType("test.json")).toBe(FileType.JSON);
        expect(p.detectFileType("test.csv")).toBe(FileType.CSV);
        expect(p.detectFileType("test.unknown")).toBe(FileType.UNKNOWN);
    });

    it("should save a file", async () => {
        const content = "Hello, World!";
        const filename = "hello.txt";
        const file = new File([content], filename, { type: "text/plain" });

        const metadata = await processor.saveFile(file);

        expect(metadata.filename).toBe(filename);
        expect(metadata.fileType).toBe(FileType.TEXT);
        expect(metadata.size).toBe(content.length);
        expect(metadata.path).toBe(path.join(TEST_UPLOAD_DIR, filename));

        const savedContent = await fs.readFile(metadata.path, "utf-8");
        expect(savedContent).toBe(content);
    });

    it("should process a text file into chunks", async () => {
        const content =
            "This is a long text that should be split into multiple chunks because the chunk size is set to 100 characters in the test configuration. It needs to be long enough to verify the splitting logic works as expected.";
        const filename = "long.txt";
        const file = new File([content], filename, { type: "text/plain" });

        const metadata = await processor.saveFile(file);
        const embeddings = new OpenAIEmbeddings();
        const documents = await processor.processFile(metadata, embeddings);

        expect(documents.length).toBeGreaterThan(1);
        const firstDoc = documents[0];
        expect(firstDoc).toBeDefined();
        if (firstDoc) {
            expect(firstDoc.metadata.filename).toBe(filename);
            expect(firstDoc.metadata.chunkIndex).toBe(0);
        }
    });

    it("should list uploaded files", async () => {
        const files = await processor.listFiles();
        expect(files.length).toBeGreaterThanOrEqual(2); // hello.txt and long.txt
        const filenames = files.map((f) => f.filename);
        expect(filenames).toContain("hello.txt");
        expect(filenames).toContain("long.txt");
    });

    it("should delete a file", async () => {
        const success = await processor.deleteFile("hello.txt");
        expect(success).toBe(true);

        const files = await processor.listFiles();
        const filenames = files.map((f) => f.filename);
        expect(filenames).not.toContain("hello.txt");
    });

    it("should clear all files", async () => {
        const count = await processor.clearAll();
        expect(count).toBeGreaterThan(0);

        const files = await processor.listFiles();
        expect(files.length).toBe(0);
    });
});
