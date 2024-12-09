self.onmessage = function(event) {
	const program = event.data.source;
	const files = event.data.files;
	let bytecode = [];
	function writeString(string) {
		for (let i = 0; i < string.length; i++) {
			bytecode.push(string.charPointAt(i));
		}
	}
	// Include the necessary magic number, and metadata
	writeString("BLAN");
	bytecode.push(2); // Version 2: Version 0 is the legacy, and Version 1 is the first rework.
	bytecode.push(0, 0); // First subversion; other subversions may be added. Other subversion number is to prevent overflows.
	bytecode.push(files.length ? 1 : 0);
	bytecode.push(0, 0, 0) // keep in mind that index 8 and 9 and 10 is where this is stored; used for getting the length of bytecode data.
	const tokens = program.match(/[a-zA-Z_]+|\[[a-zA-Z]+\]|\-?\d+(\.\d+)?|"(\\"|[^"])*"|[\n\t\r ](?:[\n\t\r ]+)/g), identifier = /^[a-zA-Z_]+$/, type = /^\[[a-zA-Z]\]+$/;
	const count = tokens.length >>> 0, typeMap = {UINT8: 0, UINT16: 1, INT8: 2, INT16: 3};
	let i = 0, token, accumulatorCount = 0, currentLine = 1, currentAccumulator = 0;
	function info(t) {
		return (t ? "at t" : "Error occurred at: T") + "oken index " + i + ", line " + currentLine + ", token \"" + tokens[token] + "\"";
	}
	function handleType(relevantInfo) {
		const type = relevantInfo[0];
		switch (type) {
				case "UINT8":
					return [Number(relevantInfo[1])];
				case "UINT16": {
					const temp = Number(relevantInfo[1]);
					return [temp, temp >> 8];
				}
				case "INT8":
					return [(Number(relevantInfo[1]) + 128)];
				case "INT16": {
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
					if (accumulatorCount === 0 || !Object.protoype.hasOwnProperty.call(accumulators, identifier)) {
						accumulators[identifier] = accumulatorCount;
						accumulatorCount++;
					}
					if (accumulatorCount !== 1 && accumulators[identifier] !== currentAccummulator) {
						bytecode.push(1, accumulators[identifier]); // Set the current accumulator to the requested accumulator
					}
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
}
