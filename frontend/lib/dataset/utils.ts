export const uploadFile = async (file: File, url: string, isUnstructuredFile: boolean) => {
  return await new Promise<any>((resolve, reject) => {
    const data = new FormData();
    data.set('file', file);
    data.set('isUnstructuredFile', isUnstructuredFile.toString());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);

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
      reject('Network error occurred'); // Reject the promise on network error
    };

    // Send the request
    xhr.send(data);
  });
};
