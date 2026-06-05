import { defineChain } from "viem";

export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "MNT",
    symbol: "MNT",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.sepolia.mantle.xyz"],
    },
  },
  blockExplorers: {
    default: {
      name: "Mantle Sepolia Explorer",
      url: "https://sepolia.mantlescan.xyz",
    },
  },
  testnet: true,
});

export function txUrl(hash: string) {
  return `${mantleSepolia.blockExplorers.default.url}/tx/${hash}`;
}

export function addressUrl(address: string) {
  return `${mantleSepolia.blockExplorers.default.url}/address/${address}`;
}
