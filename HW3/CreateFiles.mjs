/*
Program to create number of files
by Vojtech Naar
*/

import { readFile, writeFile } from "fs/promises";

async function main() {
    try {

        const instructions = await readFile("instructions.txt", "utf8");
        const n = Number(instructions.trim());

        const promises = [];

        for (let i = 0; i <= n; i++) {
            const filename = `${i}.txt`;
            const content = `File ${i}`;

            promises.push(writeFile(filename, content));
        }

        await Promise.all(promises);

        console.log("All files successfuly created.");

    } catch (err) {
        console.log("Error:", err.message);
    }
}

main();