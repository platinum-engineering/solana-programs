const anchor = require('@project-serum/anchor');
const serumCmn = require('@project-serum/common');

const utils = require('./utils');

const lockerIdl = require('../../target/idl/simple_locker.json');

const LOCALNET = 'localnet';
const DEVNET = 'devnet';

class Client {
  constructor(provider, cluster, programId) {
    this.provider = provider;
    this.cluster = cluster === undefined ? LOCALNET : cluster;
    this.programId = programId === undefined ? lockerIdl.metadata.address : programId;

    this.program = this.initProgram();
  }

  initProgram() {
    switch (this.cluster) {
      case LOCALNET:
        return new anchor.Program(lockerIdl, this.programId, this.provider);

      case DEVNET:
        return new anchor.Program(lockerIdl, this.programId, this.provider);
    }
  }

  async findMintInfoAddress(mint) {
    const [mintInfo, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        mint.toBytes()
      ],
      this.program.programId
    );
    return [mintInfo, bump];
  }

  async findConfigAddress() {
    const [config, bump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        new TextEncoder().encode("config")
      ],
      this.program.programId
    );
    return [config, bump];
  }

  async vaultAuthorityAddress(locker) {
    return await anchor.web3.PublicKey.createProgramAddress(
      [
        locker.publicKey.toBytes(),
        [locker.account.vaultBump]
      ],
      this.program.programId
    );
  }

  async isMintWhitelisted(mint) {
    const [mintInfo, _bump] = await this.findMintInfoAddress(mint);

    return await tryIfExists(
      this.program, "mintInfo", mintInfo,
      (mintInfoAccount) => mintInfoAccount.feePaid,
      () => false,
    );
  }

  async isTokenAccepted(mint) {
    if (this.program.programName == TOKEN_LOCKER) {
      return true;
    } else {
      const [mintInfo, _bump] = await this.findMintInfoAddress(mint);

      return await tryIfExists(
        this.program, "mintInfo", mintInfo,
        (_mintInfoAccount) => true,
        () => false,
      );
    }
  }

  async getOrCreateMintInfo(mint, payer, config) {
    const [mintInfo, bump] = await this.findMintInfoAddress(mint);

    return await tryIfExists(
      this.program, "mintInfo", mintInfo,
      (_mintInfoAccount) => [mintInfo, []],
      () => {
        let initMintInfoInstr = this.program.instruction.initMintInfo(
          bump,
          {
            accounts: {
              payer,
              mintInfo,
              mint,
              config,
              systemProgram: anchor.web3.SystemProgram.programId,
            }
          }
        );
        return [mintInfo, [initMintInfoInstr]];
      }
    );
  }

  async createLocker(args) {
    const locker = anchor.web3.Keypair.generate();
    const [vaultAuthority, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        locker.publicKey.toBytes()
      ],
      this.program.programId,
    );

    const fundingWalletAccount = await serumCmn.getTokenAccount(this.provider, args.fundingWallet);
    const vault = anchor.web3.Keypair.generate();
    const createTokenAccountInstrs = await serumCmn.createTokenAccountInstrs(
      this.provider,
      vault.publicKey,
      fundingWalletAccount.mint,
      vaultAuthority
    );

    const [config, _] = await this.findConfigAddress();
    const configAccount = await this.program.account.config.fetch(config);

    const [mintInfo, initMintInfoInstrs] = await getOrCreateMintInfo(
      this.program,
      fundingWalletAccount.mint,
      args.creator,
      config
    );
    const [feeTokenWallet, createAssociatedTokenAccountInstrs] = await utils.getOrCreateAssociatedTokenAccountInstrs(
      this.provider, fundingWalletAccount.mint, configAccount.feeWallet
    );

    await this.program.rpc.createLocker(
      {
        amount: args.amount,
        unlockDate: args.unlockDate,
        vaultBump,
        feeInSol: args.feeInSol,
      },
      {
        accounts: {
          locker: locker.publicKey,
          creator: args.creator,
          owner: args.owner,
          vault: vault.publicKey,
          vaultAuthority,
          fundingWalletAuthority: args.fundingWalletAuthority,
          fundingWallet: args.fundingWallet,
          feeWallet: configAccount.feeWallet,
          feeTokenWallet,
          mintInfo,
          config,

          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: utils.TOKEN_PROGRAM_ID,
        },
        instructions: createTokenAccountInstrs
          .concat(initMintInfoInstrs)
          .concat(createAssociatedTokenAccountInstrs),
        signers: [vault, locker],
      }
    );

    return locker.publicKey;
  }

  async getLockers() {
    return await this.program.account.locker.all();
  }

  async getLockersOwnedBy(owner) {
    if (owner === undefined) {
      owner = this.provider.wallet.publicKey;
    }
    return await this.program.account.locker.all([
      {
        memcmp: {
          // 8 bytes for discriminator
          offset: 8,
          bytes: owner.toBase58(),
        },
      },
    ]);
  }

  async relock(args) {
    return await this.program.rpc.relock(
      args.unlockDate,
      {
        accounts: {
          locker: args.locker.publicKey,
          owner: args.locker.account.owner,
        }
      }
    );
  }

  async transferOwnership(args) {
    const rpcArgs = {
      accounts: {
        locker: args.locker.publicKey,
        owner: args.locker.account.owner,
        newOwner: args.newOwner,
      }
    };

    if (args.signers !== undefined) {
      rpcArgs.signers = args.signers;
    }

    return await this.program.rpc.transferOwnership(rpcArgs);
  }

  async incrementLock(args) {
    const [config, _] = await this.findConfigAddress();
    const configAccount = await this.program.account.config.fetch(config);

    const fundingWalletAccount = await serumCmn.getTokenAccount(this.provider, args.fundingWallet);
    const [mintInfo, initMintInfoInstrs] = await getOrCreateMintInfo(
      this.program,
      fundingWalletAccount.mint,
      args.fundingWalletAuthority
    );
    const [feeTokenWallet, createAssociatedTokenAccountInstrs] = await utils.getOrCreateAssociatedTokenAccountInstrs(
      this.provider, fundingWalletAccount.mint, configAccount.feeWallet
    );

    await this.program.rpc.incrementLock(
      args.amount,
      {
        accounts: {
          locker: args.locker.publicKey,
          vault: args.locker.account.vault,
          fundingWallet: args.fundingWallet,
          fundingWalletAuthority: args.fundingWalletAuthority,
          feeWallet: feeTokenWallet,
          tokenProgram: utils.TOKEN_PROGRAM_ID,
          mintInfo,
          config
        },
        instructions: initMintInfoInstrs
          .concat(createAssociatedTokenAccountInstrs)
      }
    );

    return feeTokenWallet;
  }

  async withdrawFunds(args) {
    const vaultAuthority = await anchor.web3.PublicKey.createProgramAddress(
      [
        args.locker.publicKey.toBytes(),
        [args.locker.account.vaultBump]
      ],
      this.program.programId,
    );

    let targetWallet = args.targetWallet;
    let extraInstructions = [];

    if (args.createAssociated) {
      const vaultWalletAccount = await serumCmn.getTokenAccount(this.provider, args.locker.account.vault);
      const [targetTokenWallet, createAssociatedTokenAccountInstrs] = await utils.getOrCreateAssociatedTokenAccountInstrs(
        this.provider, vaultWalletAccount.mint, targetWallet
      );
      targetWallet = targetTokenWallet;
      extraInstructions = extraInstructions.concat(createAssociatedTokenAccountInstrs);
    }

    await this.program.rpc.withdrawFunds(
      args.amount,
      {
        accounts: {
          locker: args.locker.publicKey,
          owner: args.locker.account.owner,
          vaultAuthority,
          vault: args.locker.account.vault,
          targetWallet,

          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          tokenProgram: utils.TOKEN_PROGRAM_ID,
        },
        instructions: extraInstructions
      }
    );

    return targetWallet;
  }

  async closeLocker(args) {
    const vaultAuthority = await anchor.web3.PublicKey.createProgramAddress(
      [
        args.locker.publicKey.toBytes(),
        [args.locker.account.vaultBump]
      ],
      this.program.programId,
    );

    await this.program.rpc.withdrawFunds(
      {
        accounts: {
          locker: args.locker.publicKey,
          owner: args.locker.account.owner,
          vaultAuthority,
          vault: args.locker.account.vault,
          targetWallet: args.targetWallet,

          tokenProgram: utils.TOKEN_PROGRAM_ID,
        }
      }
    );

    return vaultAuthority;
  }

  async splitLocker(args) {
    const oldVaultAuthority = await anchor.web3.PublicKey.createProgramAddress(
      [
        args.locker.publicKey.toBytes(),
        [args.locker.account.vaultBump]
      ],
      this.program.programId,
    );

    const newLocker = anchor.web3.Keypair.generate();
    const [newVaultAuthority, newVaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        newLocker.publicKey.toBytes(),
      ],
      this.program.programId,
    );

    const vaultAccount = await serumCmn.getTokenAccount(this.provider, args.locker.account.vault);
    const newVault = anchor.web3.Keypair.generate();
    const createTokenAccountInstrs = await serumCmn.createTokenAccountInstrs(
      this.provider,
      newVault.publicKey,
      vaultAccount.mint,
      newVaultAuthority
    );

    await this.program.rpc.splitLocker(
      {
        amount: args.amount,
        vaultBump: newVaultBump,
      },
      {
        accounts: {
          oldLocker: args.locker.publicKey,
          oldOwner: args.locker.account.owner,
          oldVaultAuthority,
          oldVault: args.locker.account.vault,

          newLocker: newLocker.publicKey,
          newOwner: args.newOwner,
          newVaultAuthority,
          newVault: newVault.publicKey,

          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: utils.TOKEN_PROGRAM_ID,
        },
        instructions: createTokenAccountInstrs,
        signers: [newVault, newLocker],
      }
    );

    return [newLocker.publicKey, newVault.publicKey];
  }
}

const FAILED_TO_FIND_ACCOUNT = "Account does not exist";

async function tryIfExists(program, account, address, found, notFound) {
  try {
    const accountInfo = await program.account[account].fetch(address);
    return found(accountInfo);
  } catch (err) {
    const errMessage = `${FAILED_TO_FIND_ACCOUNT} ${address.toString()}`;
    if (err.message === errMessage) {
      return notFound();
    } else {
      throw err;
    }
  }
}

module.exports = {
  LOCALNET,
  DEVNET,
  Client,
  utils,
};
