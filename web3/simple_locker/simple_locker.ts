export type SimpleLocker = {
  "version": "0.1.0",
  "name": "simple_locker",
  "instructions": [
    {
      "name": "createLocker",
      "accounts": [
        {
          "name": "locker",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "creator",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "owner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "fundingWalletAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "fundingWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "vaultAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "CreateLockerArgs"
          }
        }
      ]
    },
    {
      "name": "relock",
      "accounts": [
        {
          "name": "locker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "unlockDate",
          "type": "i64"
        }
      ]
    },
    {
      "name": "transferOwnership",
      "accounts": [
        {
          "name": "locker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "newOwner",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "incrementLock",
      "accounts": [
        {
          "name": "locker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "fundingWalletAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "fundingWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawFunds",
      "accounts": [
        {
          "name": "locker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "vaultAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "targetWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "splitLocker",
      "accounts": [
        {
          "name": "oldLocker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "oldOwner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "oldVaultAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "oldVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "newLocker",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "newOwner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "newVaultAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "newVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "SplitLockerArgs"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "locker",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "publicKey"
          },
          {
            "name": "currentUnlockDate",
            "type": "i64"
          },
          {
            "name": "depositedAmount",
            "type": "u64"
          },
          {
            "name": "vault",
            "type": "publicKey"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "creator",
            "type": "publicKey"
          },
          {
            "name": "originalUnlockDate",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "CreateLockerArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "unlockDate",
            "type": "i64"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "SplitLockerArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "UnlockInThePast",
      "msg": "The given unlock date is in the past"
    },
    {
      "code": 6001,
      "name": "InvalidTimestamp"
    },
    {
      "code": 6002,
      "name": "IntegerOverflow"
    },
    {
      "code": 6003,
      "name": "NothingToLock"
    },
    {
      "code": 6004,
      "name": "InvalidAmountTransferred"
    },
    {
      "code": 6005,
      "name": "InvalidPeriod"
    },
    {
      "code": 6006,
      "name": "CannotUnlockToEarlierDate"
    },
    {
      "code": 6007,
      "name": "TooEarlyToWithdraw"
    },
    {
      "code": 6008,
      "name": "InvalidAmount"
    }
  ]
};

export const IDL: SimpleLocker = {
  "version": "0.1.0",
  "name": "simple_locker",
  "instructions": [
    {
      "name": "createLocker",
      "accounts": [
        {
          "name": "locker",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "creator",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "owner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "fundingWalletAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "fundingWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "vaultAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "CreateLockerArgs"
          }
        }
      ]
    },
    {
      "name": "relock",
      "accounts": [
        {
          "name": "locker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": false,
          "isSigner": true
        }
      ],
      "args": [
        {
          "name": "unlockDate",
          "type": "i64"
        }
      ]
    },
    {
      "name": "transferOwnership",
      "accounts": [
        {
          "name": "locker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "newOwner",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "incrementLock",
      "accounts": [
        {
          "name": "locker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "fundingWalletAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "fundingWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawFunds",
      "accounts": [
        {
          "name": "locker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "owner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "vaultAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "vault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "targetWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "splitLocker",
      "accounts": [
        {
          "name": "oldLocker",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "oldOwner",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "oldVaultAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "oldVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "newLocker",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "newOwner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "newVaultAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "newVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": "SplitLockerArgs"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "locker",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "publicKey"
          },
          {
            "name": "currentUnlockDate",
            "type": "i64"
          },
          {
            "name": "depositedAmount",
            "type": "u64"
          },
          {
            "name": "vault",
            "type": "publicKey"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "creator",
            "type": "publicKey"
          },
          {
            "name": "originalUnlockDate",
            "type": "i64"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "CreateLockerArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "unlockDate",
            "type": "i64"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "SplitLockerArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "UnlockInThePast",
      "msg": "The given unlock date is in the past"
    },
    {
      "code": 6001,
      "name": "InvalidTimestamp"
    },
    {
      "code": 6002,
      "name": "IntegerOverflow"
    },
    {
      "code": 6003,
      "name": "NothingToLock"
    },
    {
      "code": 6004,
      "name": "InvalidAmountTransferred"
    },
    {
      "code": 6005,
      "name": "InvalidPeriod"
    },
    {
      "code": 6006,
      "name": "CannotUnlockToEarlierDate"
    },
    {
      "code": 6007,
      "name": "TooEarlyToWithdraw"
    },
    {
      "code": 6008,
      "name": "InvalidAmount"
    }
  ]
};
