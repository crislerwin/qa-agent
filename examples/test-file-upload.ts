#!/usr/bin/env bun

/**
 * Test script for file upload and processing
 * 
 * This script demonstrates how to:
 * 1. Create a test file
 * 2. Upload it to the API
 * 3. Process it into embeddings
 * 4. Search the knowledge base
 */

const API_BASE = "http://localhost:3000";

async function createTestFile() {
    const content = `
# AI Agents Documentation

## What are AI Agents?

AI agents are autonomous systems that can perceive their environment, make decisions, 
and take actions to achieve specific goals. They combine large language models with 
tools and memory to perform complex tasks.

## Key Components

1. **Language Model**: The brain of the agent that processes information and makes decisions
2. **Tools**: Functions the agent can call to interact with external systems
3. **Memory**: Storage for conversation history and learned information
4. **Vector Database**: Enables semantic search over documents and knowledge

## Use Cases

- Customer support automation
- Document analysis and Q&A
- Code generation and debugging
- Research and information gathering
- Task automation and workflow orchestration

## Benefits

- 24/7 availability
- Consistent responses
- Scalable knowledge base
- Integration with existing systems
- Continuous learning and improvement
`;

    await Bun.write("./test-document.md", content);
    console.log("✓ Created test file: test-document.md");
}

async function uploadFile(filename: string, processImmediately: boolean = true) {
    console.log(`\n📤 Uploading ${filename}...`);
    
    const file = Bun.file(filename);
    const arrayBuffer = await file.arrayBuffer();
    
    // Create a proper File object with correct MIME type
    const blob = new Blob([arrayBuffer], { type: "text/markdown" });
    const fileObject = new File([blob], filename.split("/").pop() || filename, {
        type: "text/markdown"
    });
    
    const formData = new FormData();
    formData.append("file", fileObject);
    // Don't append as string, let the API handle the optional parameter
    if (processImmediately) {
        formData.append("processImmediately", "true");
    }

    const response = await fetch(`${API_BASE}/api/files/upload`, {
        method: "POST",
        body: formData,
    });

    const result = await response.json();
    console.log("Response:", JSON.stringify(result, null, 2));
    return result;
}

async function listFiles() {
    console.log("\n📋 Listing uploaded files...");
    
    const response = await fetch(`${API_BASE}/api/files/list`);
    const result = await response.json() as any;
    
    console.log(`Found ${result.count} files:`);
    result.files.forEach((file: any) => {
        console.log(`  - ${file.filename} (${file.fileType}, ${file.size} bytes)`);
    });
    
    return result;
}

async function searchKnowledgeBase(query: string) {
    console.log(`\n🔍 Searching for: "${query}"`);
    
    const response = await fetch(`${API_BASE}/api/rag/search`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            query,
            topK: 3,
        }),
    });

    const result = await response.json() as any;
    console.log(`\nFound ${result.count} results:\n`);
    
    result.results.forEach((doc: any, i: number) => {
        const score = (doc.metadata.score * 100).toFixed(1);
        console.log(`[${i + 1}] Relevance: ${score}%`);
        console.log(`Source: ${doc.metadata.filename} (chunk ${doc.metadata.chunkIndex + 1}/${doc.metadata.totalChunks})`);
        console.log(`Content: ${doc.content.substring(0, 200)}...`);
        console.log();
    });
    
    return result;
}

async function deleteFile(filename: string) {
    console.log(`\n🗑️  Deleting ${filename}...`);
    
    const response = await fetch(`${API_BASE}/api/files/${filename}`, {
        method: "DELETE",
    });

    const result = await response.json();
    console.log("Response:", JSON.stringify(result, null, 2));
    return result;
}

async function main() {
    console.log("🧪 File Upload & Processing Test\n");
    console.log("=================================\n");

    try {
        // Step 1: Create test file
        await createTestFile();

        // Step 2: Upload and process
        await uploadFile("./test-document.md", true);

        // Step 3: List files
        await listFiles();

        // Step 4: Search knowledge base
        await searchKnowledgeBase("What are the key components of AI agents?");
        await searchKnowledgeBase("What are the benefits of using AI agents?");

        // Step 5: Clean up (optional)
        // await deleteFile("test-document.md");

        console.log("\n✅ Test completed successfully!");
        console.log("\nNext steps:");
        console.log("  - Upload your own files using the API");
        console.log("  - Try different search queries");
        console.log("  - Check the documentation in docs/FILE_UPLOAD.md");

    } catch (error) {
        console.error("\n❌ Test failed:", error);
        process.exit(1);
    }
}

main();
