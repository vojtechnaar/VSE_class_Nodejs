/*
Program for reading and writing into txt files
by Vojtech Naar
*/


import { readFile, writeFile } from "fs/promises";

try {

    const instructions = await readFile("instructions.txt", "utf8");

    const [sourceFile, targetFile] = instructions.trim().split("\n");

    const data = await readFile(sourceFile.trim(), "utf8");

    await writeFile(targetFile.trim(), data);

    console.log("File copied successfully.");

} catch (err) {
    console.log("Error:", err.message);
}