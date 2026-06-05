import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import solc from "solc";

const root = path.resolve(import.meta.dirname, "..");
const contractsDir = path.join(root, "contracts");
const artifactsDir = path.join(root, "artifacts");

const files = (await readdir(contractsDir)).filter((file) => file.endsWith(".sol"));

const sources = Object.fromEntries(
  await Promise.all(
    files.map(async (file) => [
      file,
      {
        content: await readFile(path.join(contractsDir, file), "utf8"),
      },
    ]),
  ),
);

const input = {
  language: "Solidity",
  sources,
  settings: {
    evmVersion: "paris",
    viaIR: true,
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      "*": {
        "*": ["abi", "devdoc", "evm.bytecode.object", "evm.deployedBytecode.object", "userdoc"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors?.length) {
  for (const error of output.errors) {
    const level = error.severity === "error" ? "error" : "warn";
    console[level](error.formattedMessage);
  }
}

const hasError = output.errors?.some((error: { severity: string }) => error.severity === "error");
if (hasError) {
  process.exit(1);
}

await mkdir(artifactsDir, { recursive: true });

for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
  for (const [contractName, artifact] of Object.entries(contracts as Record<string, any>)) {
    await writeFile(
      path.join(artifactsDir, `${contractName}.json`),
      JSON.stringify(
        {
          contractName,
          sourceName,
          abi: artifact.abi,
          devdoc: artifact.devdoc,
          userdoc: artifact.userdoc,
          bytecode: `0x${artifact.evm.bytecode.object}`,
          deployedBytecode: `0x${artifact.evm.deployedBytecode.object}`,
        },
        null,
        2,
      ),
    );
  }
}

console.log(`Compiled ${files.length} Solidity files into ${artifactsDir}`);
