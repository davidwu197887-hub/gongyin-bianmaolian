import { study, financingStudy } from "./study";
self.onmessage = (event) => {
  const { id, request } = event.data;
  try {
    const run: any = request.kind === "financing" ? financingStudy : study;
    const result = run(request, (done: number, total: number) =>
      self.postMessage({ id, progress: { done, total } }),
    );
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: (e as Error).message });
  }
};
