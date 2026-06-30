import { withBasePath } from "@/lib/utils";

export const uploadFile = async (file: File, url: string) =>
  await new Promise<any>((resolve, reject) => {
    const data = new FormData();
    data.set("file", file);

    const xhr = new XMLHttpRequest();
    // XMLHttpRequest is not covered by the global fetch/EventSource base-path
    // shim, so prefix root-relative URLs here for sub-path deploys.
    xhr.open("POST", withBasePath(url), true);

    // Handle completion
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText)); // Resolve the promise on success
      } else {
        reject(xhr.statusText); // Reject the promise on failure
      }
    };

    // Handle errors
    xhr.onerror = () => {
      reject("Network error occurred"); // Reject the promise on network error
    };

    // Send the request
    xhr.send(data);
  });
