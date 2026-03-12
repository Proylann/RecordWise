require("dotenv").config({
  path: require("path").resolve(__dirname, ".env"),
  override: true
});

const HDWalletProvider = require("@truffle/hdwallet-provider");

const {
  GANACHE_RPC_URL = "http://127.0.0.1:7545",
  GANACHE_NETWORK_ID = "5777",
  GANACHE_PRIVATE_KEY,
  GANACHE_GAS,
  GANACHE_GAS_PRICE
} = process.env;

const ganacheNetwork = GANACHE_PRIVATE_KEY
  ? {
      provider: () =>
        new HDWalletProvider({
          privateKeys: [GANACHE_PRIVATE_KEY],
          providerOrUrl: GANACHE_RPC_URL
        }),
      network_id: Number(GANACHE_NETWORK_ID),
      gas: GANACHE_GAS ? Number(GANACHE_GAS) : undefined,
      gasPrice: GANACHE_GAS_PRICE ? Number(GANACHE_GAS_PRICE) : undefined
    }
  : {
      host: new URL(GANACHE_RPC_URL).hostname,
      port: Number(new URL(GANACHE_RPC_URL).port || 7545),
      network_id: Number(GANACHE_NETWORK_ID),
      gas: GANACHE_GAS ? Number(GANACHE_GAS) : undefined,
      gasPrice: GANACHE_GAS_PRICE ? Number(GANACHE_GAS_PRICE) : undefined
    };

module.exports = {
  contracts_directory: "./contracts",
  contracts_build_directory: "./build/contracts",
  migrations_directory: "./migrations",
  networks: {
    ganache: ganacheNetwork
  },
  compilers: {
    solc: {
      version: "0.8.20",
      settings: {
        evmVersion: "paris",
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  }
};
