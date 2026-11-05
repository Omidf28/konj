import test from "node:test";
import assert from "node:assert/strict";
import { loadPreviewTexture, PreviewTextureError } from "../src/lib/preview-texture.ts";

test("image failure and synchronous loader errors expose only the typed safe error", async () => {
  for (const throws of [false, true]) {
    const request = loadPreviewTexture((_success, failure) => {
      if (throws) throw Error("private-image-url: internal loader detail");
      failure();
    });
    await assert.rejects(request.promise, (error: unknown) => {
      assert.ok(error instanceof PreviewTextureError);
      assert.equal(error.name, "PreviewTextureError");
      assert.match(error.message, /خواندن تصویر/);
      assert.equal(error.message.includes("private-image-url"), false);
      return true;
    });
    request.cancel();
  }
});
