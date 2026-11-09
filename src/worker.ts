import { study } from "./study";
self.onmessage = (event) => {
  const { id, request } = event.data;
  try {
    const result = study(request, (done, total) =>
      self.postMessage({ id, progress: { done, total } }),
    );
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: (e as Error).message });
  }
};
