import { describe, it, expect } from "bun:test";

const API_URL = "http://localhost:3000";

describe("API Integration Tests", () => {
  it("GET /health should return status ok", async () => {
    const response = await fetch(`${API_URL}/health`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.status).toBe("ok");
  });

  it("POST /api/files/upload should upload a file", async () => {
    const content = "Integration test file content";
    const filename = "integration-test.txt";
    const file = new File([content], filename, { type: "text/plain" });

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_URL}/api/files/upload`, {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.success).toBe(true);
    expect(data.metadata.filename).toBe(filename);
  });

  it("GET /api/files/list should list uploaded files", async () => {
    const response = await fetch(`${API_URL}/api/files/list`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as any;

    expect(data.files).toBeDefined();
    expect(Array.isArray(data.files)).toBe(true);
    const filenames = data.files.map((f: any) => f.filename);
    expect(filenames).toContain("integration-test.txt");
  });

  it("DELETE /api/files/:filename should delete the file", async () => {
    const filename = "integration-test.txt";
    const response = await fetch(`${API_URL}/api/files/${filename}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.success).toBe(true);

    // Verify it's gone
    const listResponse = await fetch(`${API_URL}/api/files/list`);
    const listData = (await listResponse.json()) as any;
    const filenames = listData.files.map((f: any) => f.filename);
    expect(filenames).not.toContain(filename);
  });
});
