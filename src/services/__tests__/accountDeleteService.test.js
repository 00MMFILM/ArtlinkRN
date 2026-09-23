jest.mock("../apiConfig", () => ({ SERVER_URL: "https://server.test", getApiHeaders: () => ({ Authorization: "Bearer token", "X-App-Token": "app" }) }));
const { requestAccountDelete } = require("../accountDeleteService");

beforeEach(() => { global.fetch = jest.fn(); });

test("complete:true만 삭제 완료로 인정하고 excludes를 그대로 전달한다", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, complete: true, deleted: { notes: 3 }, excludes: ["guest_media"] }) });
  await expect(requestAccountDelete()).resolves.toEqual({ deleted: { notes: 3 }, excludes: ["guest_media"] });
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toBe("https://server.test/api/account-delete");
  expect(init.method).toBe("POST");
  expect(init.headers).toMatchObject({ Authorization: "Bearer token", "X-App-Token": "app" });
});

test("일부 실패(500, complete:false)는 실패한 항목과 재시도 가능 여부를 올린다", async () => {
  global.fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, complete: false, failed: ["media_archive"], retryable: true }) });
  await expect(requestAccountDelete()).rejects.toMatchObject({ failed: ["media_archive"], retryable: true });
});

test("HTTP 200이어도 complete가 아니면 완료로 처리하지 않는다", async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, complete: false }) });
  await expect(requestAccountDelete()).rejects.toThrow("ACCOUNT_DELETE_INCOMPLETE");
});
