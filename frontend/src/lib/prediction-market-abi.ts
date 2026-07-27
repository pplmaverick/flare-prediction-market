export const predictionMarketAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_teeExtensionRegistry",
        "type": "address",
        "internalType": "contract ITeeExtensionRegistry"
      },
      {
        "name": "_teeMachineRegistry",
        "type": "address",
        "internalType": "contract ITeeMachineRegistry"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "OP_COMMAND_DEPOSIT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OP_COMMAND_PLACE_BET",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OP_COMMAND_SETTLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OP_COMMAND_WITHDRAW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "OP_TYPE_PREDICTION_MARKET",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TEE_EXTENSION_REGISTRY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ITeeExtensionRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TEE_MACHINE_REGISTRY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ITeeMachineRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createMarket",
    "inputs": [
      {
        "name": "marketType",
        "type": "uint8",
        "internalType": "enum PredictionMarket.MarketType"
      },
      {
        "name": "typeParams",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "duration",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "marketId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "executeWithdrawal",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "withdrawalId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getMarket",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct PredictionMarket.Market",
        "components": [
          {
            "name": "marketType",
            "type": "uint8",
            "internalType": "enum PredictionMarket.MarketType"
          },
          {
            "name": "startTimestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "expirationTimestamp",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "settled",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "winningBucket",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "referenceValue",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "feedId",
            "type": "bytes21",
            "internalType": "bytes21"
          },
          {
            "name": "startPrice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "latitude",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "longitude",
            "type": "int256",
            "internalType": "int256"
          },
          {
            "name": "bucketThresholds",
            "type": "int256[]",
            "internalType": "int256[]"
          },
          {
            "name": "bucketPools",
            "type": "uint256[]",
            "internalType": "uint256[]"
          },
          {
            "name": "totalPool",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "marketCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "markets",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "marketType",
        "type": "uint8",
        "internalType": "enum PredictionMarket.MarketType"
      },
      {
        "name": "startTimestamp",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expirationTimestamp",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "settled",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "winningBucket",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "referenceValue",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "feedId",
        "type": "bytes21",
        "internalType": "bytes21"
      },
      {
        "name": "startPrice",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "latitude",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "longitude",
        "type": "int256",
        "internalType": "int256"
      },
      {
        "name": "totalPool",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "payToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "placeBet",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "encryptedBet",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "requestPriceSettlement",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "requestWeatherSettlement",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "proof",
        "type": "tuple",
        "internalType": "struct IWeb2Json.Proof",
        "components": [
          {
            "name": "merkleProof",
            "type": "bytes32[]",
            "internalType": "bytes32[]"
          },
          {
            "name": "data",
            "type": "tuple",
            "internalType": "struct IWeb2Json.Response",
            "components": [
              {
                "name": "attestationType",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "sourceId",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "votingRound",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "lowestUsedTimestamp",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "requestBody",
                "type": "tuple",
                "internalType": "struct IWeb2Json.RequestBody",
                "components": [
                  {
                    "name": "url",
                    "type": "string",
                    "internalType": "string"
                  },
                  {
                    "name": "httpMethod",
                    "type": "string",
                    "internalType": "string"
                  },
                  {
                    "name": "headers",
                    "type": "string",
                    "internalType": "string"
                  },
                  {
                    "name": "queryParams",
                    "type": "string",
                    "internalType": "string"
                  },
                  {
                    "name": "body",
                    "type": "string",
                    "internalType": "string"
                  },
                  {
                    "name": "postProcessJq",
                    "type": "string",
                    "internalType": "string"
                  },
                  {
                    "name": "abiSignature",
                    "type": "string",
                    "internalType": "string"
                  }
                ]
              },
              {
                "name": "responseBody",
                "type": "tuple",
                "internalType": "struct IWeb2Json.ResponseBody",
                "components": [
                  {
                    "name": "abiEncodedData",
                    "type": "bytes",
                    "internalType": "bytes"
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "setExtensionId",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPayToken",
    "inputs": [
      {
        "name": "_token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setTeeAddress",
    "inputs": [
      {
        "name": "_teeAddress",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settlePriceMarket",
    "inputs": [
      {
        "name": "resultData",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "actionId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "submissionTag",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settleWeatherMarket",
    "inputs": [
      {
        "name": "resultData",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "actionId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "submissionTag",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "signature",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "teeAddress",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usedWithdrawalIds",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "event",
    "name": "BetPlaced",
    "inputs": [
      {
        "name": "instructionId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "marketId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "bettor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DepositRequested",
    "inputs": [
      {
        "name": "instructionId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "depositor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MarketCreated",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "marketType",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum PredictionMarket.MarketType"
      },
      {
        "name": "expirationTimestamp",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MarketSettled",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "winningBucket",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "referenceValue",
        "type": "int256",
        "indexed": false,
        "internalType": "int256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PayTokenSet",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SettlementRequested",
    "inputs": [
      {
        "name": "marketId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "instructionId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "winningBucket",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "referenceValue",
        "type": "int256",
        "indexed": false,
        "internalType": "int256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TeeAddressSet",
    "inputs": [
      {
        "name": "teeAddress",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WithdrawRequested",
    "inputs": [
      {
        "name": "instructionId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "requester",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WithdrawalExecuted",
    "inputs": [
      {
        "name": "withdrawalId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  }
] as const;
