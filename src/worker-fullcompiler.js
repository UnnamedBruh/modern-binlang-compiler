self.onmessage = function(event) {
	if (event.data.step === 0) {
		const program = event.data.source;
		const files = event.data.files;
		let bytecode = [];
		function writeString(string) {
			for (let i = 0; i < string.length; i++) {
				bytecode.push(string.charCodeAt(i));
			}
		}
		// Include the necessary magic number
		writeString("BLAN");
		bytecode.push(2); // Version 2: Version 0 is the legacy, and Version 1 is the first rework.
		bytecode.push(0, 0); // First subversion; other subversions may be added. Other subversion number is to prevent overflows.
		bytecode.push(files.length ? 1 : 0);
		bytecode.push(0, 0, 0) // keep in mind that index 8 and 9 and 10 is where this is stored; used for getting the length of bytecode data.
		const tokens = program.match(/[a-zA-Z_]+|\[[a-zA-Z]+\]|\-?\d+(\.\d+)?|"(\\"|[^"])*"|[\n\t\r ](?:[\n\t\r ]+)/g), identifier = /^[a-zA-Z_]+$/, type = /^\[[a-zA-Z]\]+$/;
		const count = tokens.length >>> 0, typeMap = {UINT8: 0, UINT16: 1, INT8: 2, INT16: 3};
		let i = 0, token, accumulatorCount = 0, currentLine = 1, currentAccumulator = 0, bytecodeCount = 0;
		function info(t) {
			return (t ? "at t" : "Error occurred at: T") + "oken index " + i + ", line " + currentLine + ", token \"" + tokens[token] + "\"";
		}
		function handleType(relevantInfo) {
			const type = relevantInfo[0];
			switch (type) {
					case "UINT8":
						bytecodeCount++;
						return [Number(relevantInfo[1])];
					case "UINT16": {
						bytecodeCount += 2;
						const temp = Number(relevantInfo[1]);
						return [temp, temp >> 8];
					}
					case "INT8":
						bytecodeCount++;
						return [(Number(relevantInfo[1]) + 128)];
					case "INT16": {
						bytecodeCount += 2;
						const temp = Number(relevantInfo[1]) + 32768;
						return [temp, temp >> 8];
					}
			}
		}
		const accumulators = {};
		for (; i < count; i++) {
			token = tokens[i];
			switch (token) {
				case "SET":
					if (i + 4 > count) {
						postMessage({type: "error", error: "There are not enough tokens for the SET command in the program.\n\n" + info()});
						return;
					}
					i++;
					if (tokens[i].match(identifier)) {
						if (accumulatorCount === 0 || !Object.prototype.hasOwnProperty.call(accumulators, identifier)) {
							accumulators[identifier] = accumulatorCount;
							accumulatorCount++;
						}
						if (accumulators[identifier] !== currentAccumulator) {
							bytecodeCount += 2;
							bytecode.push(1, accumulators[identifier]); // Set the current accumulator to the requested accumulator
						}
						bytecodeCount += 2;
						bytecode.push(2);
						i++;
						if (tokens[0] !== "[" || tokens[tokens.length - 1] !== "]") {
							postMessage({type: "error", error: "Syntax error " + info(1)});
							return;
						}
						const t = tokens[i].slice(1, -1);
						if (typeMap.hasOwnProperty(t)) {
							bytecode.push(typeMap[t]);
							i++;
							const needed = [];
							while (tokens[i][0] !== "\n") {
								needed.push(tokens[i]);
								i++;
							}
							bytecode.push(...handleType(needed));
						} else {
							postMessage({type: "error", error: "The type " + tokens[i] + " does not exist yet. " + info()});
							return;
						}
					} else {
						postMessage({type: "error", error: "Syntax error " + info(1)});
						return;
					}
					break;
				default:
					if (token.split("\n").every(i => i === "\n")) {
						currentLine += token.length;
					}
			}
		}
		bytecode[8] = bytecodeCount % 256;
		bytecode[9] = (bytecodeCount >> 8) % 256;
		bytecode[10] = bytecodeCount >> 16;
		bytecode.push(255); // Bytecode program ends.
		if (files.length > 0) {
			postMessage({type: "fileprocess"}); // Requesting the main thread to process the files for the compiler
		} else {
			postMessage({type: "done", bytecode});
		}
	} else if (event.data.step === 1) {
		const bytecode = [...event.data.bytecode];
		for (let i = 0; i < event.data.processed.length; i++) {
			const fileinfo = event.data.processed[i];
			const name = fileinfo.name.split(".").pop();
			// If the file is an image...
			if (["png", "jpg", "jpeg", "ico", "bmp"].includes(name)) {
				bytecode.push(0); // An image resource.
				// Adding the image's width and height.
				bytecode.push(fileinfo.info.width % 256, fileinfo.info.width >> 8, fileinfo.info.height % 256, fileinfo.info.height >> 8);
				// Now some basic compression and checks.
				// 0 = RGBA, 1 = RGB, 2 = Grayscale, 3 = Entirely blank, 4 = Grayscale and opacity
				let typeOfImage = 4, supportsOpacity = false, supportsRGB = false, notBlank = false;
				for (let i = 0; i < fileinfo.data.length; i += 4) {
					if ((fileinfo.data[i] !== 0 && fileinfo.data[i + 1] !== 0 && fileinfo.data[i + 2] !== 0) || (fileinfo.data[i] !== 255 && fileinfo.data[i + 1] !== 255 && fileinfo.data[i + 2] !== 255)) {
						supportsRGB = true;
					}
					if (fileinfo.data[i + 3] !== 0) {
						notBlank = true;
						if (fileinfo.data[i + 3] !== 255) {
							supportsOpacity = true;
						}
					}
				}
				// Now to decide the image's type.
				if (!notBlank) {
					bytecode.push(3);
				} else if (!supportsOpacity && !supportsRGB) {
					bytecode.push(2);
				} else if (supportsOpacity && !supportsRGB) {
					bytecode.push(4);
				} else if (!supportsOpacity && supportsRGB) {
					bytecode.push(1);
				} else if (supportsOpacity && supportsRGB) {
					bytecode.push(0);
				}
				if (!notBlank) {
					// Do nothing, since providing the image's data (even though it is blank) is redundant.
				} else if (!supportsOpacity && !supportsRGB) {
					for (let i = 0; i < fileinfo.data.length; i += 4) {
						bytecode.push(fileinfo.data[i]);
					}
				} else if (supportsOpacity && !supportsRGB) {
					for (let i = 0; i < fileinfo.data.length; i += 4) {
						bytecode.push(fileinfo.data[i], fileinfo.data[i + 3]);
					}
				} else if (!supportsOpacity && supportsRGB) {
					for (let i = 0; i < fileinfo.data.length; i += 4) {
						bytecode.push(fileinfo.data[i], fileinfo.data[i + 1], fileinfo.data[i + 2]);
					}
				} else {
					bytecode.push(...fileinfo.data); // Data can directly be added, since it does not need to have only some of it's data extracted
				}
			}
		}
		postMessage({type: "done", bytecode});
	}
}