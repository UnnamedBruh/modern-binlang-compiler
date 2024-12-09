const worker = new Worker("worker-fullcompiler.js");
async function compileProgram(program, files) {
	worker.postMessage({step: 0, source: program, files});
	return new Promise(function(resolve) {
		worker.onmessage = function(data) {
			if (data.data.type === "done") {
				resolve(data.data.bytecode);
			} else if (data.data.type === "fileprocess") {
				alert("The files will be processed now (the website may become unresponsive for a few moments).");
				const canvas = new OffscreenCanvas();
				const ctx = canvas.getContext("2d");
				const prov = [];
				let filesNeededToLoad = files.length;
				for (let i = 0; i < files.length; i++) {
					const reader = new FileReader();
					if (["png", "jpg", "jpeg", "ico", "bmp"].includes(files[i].name.split(".").pop())) {
						reader.onload = function(e) {
							const image = new Image(e.target.result);
							image.onload = function() {
								canvas.width = image.width;
								canvas.height = image.height;
								ctx.drawImage(image, 0, 0, +image.width, +image.height);
								const imageData = ctx.getImageData(0, 0, +canvas.width, +canvas.height);
								prov.push({info: {width: +image.width, height: +image.height}, data: imageData.data, name: files[i].name});
								filesNeededToLoad--;
								canvas.width = 0;
								canvas.height = 0;
								image.src = "";
								image.onload = function() {};
							}
						}
						reader.readAsDataURL(files[i]);
					}
				}
				worker.postMessage({step: 1, bytecode: data.data.bytecode, processed: prov});
				worker.onmessage = function(data) {
					resolve(new Uint8Array(data.data.bytecode));
				}
			} else {
				alert(data.data.error);
				resolve();
			}
		}
	}
}
