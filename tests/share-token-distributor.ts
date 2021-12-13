import * as anchor from '@project-serum/anchor';
import * as serumCmn from '@project-serum/common';
import { TokenInstructions } from '@project-serum/serum';
import * as assert from 'assert';

import { ShareTokenDistributor } from '../target/types/share_token_distributor';
import * as simpleLocker from '../web3/simple_locker';

describe('share-token-distributor', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.ShareTokenDistributor as anchor.Program<ShareTokenDistributor>;
  const lockerClient = new simpleLocker.Client(program.provider);
  const distributor = anchor.web3.Keypair.generate();

  let
    mint: anchor.web3.PublicKey,
    fundingWallet: anchor.web3.PublicKey,
    shareWallet: anchor.web3.PublicKey;

  it('Is initialized!', async () => {
    const unlockDate = new anchor.BN(Date.now() / 1000 + 5);
    const [lockerAuthority, lockerAuthorityBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        distributor.publicKey.toBytes(),
        new TextEncoder().encode("locker")
      ],
      program.programId
    );

    [mint, fundingWallet] = await serumCmn.createMintAndVault(
      program.provider,
      new anchor.BN(1000),
      program.provider.wallet.publicKey,
      0
    );

    const locker = await lockerClient.createLocker({
      fundingWallet,
      fundingWalletAuthority: program.provider.wallet.publicKey,
      unlockDate,
      amount: new anchor.BN(1000),
      creator: program.provider.wallet.publicKey,
      owner: lockerAuthority
    });

    const [shareTokenMint, mintBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        distributor.publicKey.toBytes(),
        new TextEncoder().encode("mint"),
      ],
      program.programId
    );

    const [mintAuthority, mintAuthorityBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        shareTokenMint.toBytes(),
      ],
      program.programId
    );

    await program.rpc.initialize(
      {
        lockerAuthorityBump,
        mintBump,
        mintAuthorityBump,
      },
      {
        accounts: {
          owner: program.provider.wallet.publicKey,
          distributor: distributor.publicKey,
          shareTokenMint,
          mintAuthority,
          locker,
          lockerAuthority,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [distributor]
      }
    );
  });

  it('Adds shares', async () => {
    const [shareTokenMint, mintBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        distributor.publicKey.toBytes(),
        new TextEncoder().encode("mint"),
      ],
      program.programId
    );

    const [mintAuthority, mintAuthorityBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        shareTokenMint.toBytes(),
      ],
      program.programId
    );

    shareWallet = await serumCmn.createTokenAccount(
      program.provider,
      shareTokenMint,
      program.provider.wallet.publicKey
    );

    const shareAmount = new anchor.BN(100);

    await program.rpc.addShare(
      shareAmount,
      {
        accounts: {
          owner: program.provider.wallet.publicKey,
          distributor: distributor.publicKey,
          shareTokenMint,
          mintAuthority,
          targetWallet: shareWallet,
          tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
        }
      }
    );

    const shareWalletAccount = await serumCmn.getTokenAccount(program.provider, shareWallet);
    assert.ok(shareWalletAccount.amount.eq(shareAmount));
  });

  it('Exchanges the share', async () => {
    const [shareTokenMint, mintBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        distributor.publicKey.toBytes(),
        new TextEncoder().encode("mint"),
      ],
      program.programId
    );

    const [mintAuthority, mintAuthorityBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        shareTokenMint.toBytes(),
      ],
      program.programId
    );

    const [lockerAuthority, lockerAuthorityBump] = await anchor.web3.PublicKey.findProgramAddress(
      [
        distributor.publicKey.toBytes(),
        new TextEncoder().encode("locker")
      ],
      program.programId
    );

    const distributorAccount = await program.account.distributor.fetch(distributor.publicKey);
    const lockerAccount = await lockerClient.program.account.locker.fetch(distributorAccount.locker);
    const vaultAuthority = await lockerClient.vaultAuthorityAddress({
      publicKey: distributorAccount.locker,
      account: lockerAccount
    });

    await program.rpc.exchange(
      new anchor.BN(100),
      {
        accounts: {
          shareholder: program.provider.wallet.publicKey,
          distributor: distributor.publicKey,
          shareTokenMint,
          mintAuthority,
          shareWallet,
          shareWalletAuthority: program.provider.wallet.publicKey,
          locker: distributorAccount.locker,
          lockerAuthority,
          vault: lockerAccount.vault,
          vaultAuthority,
          targetWallet: fundingWallet,
          tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
          lockerProgram: lockerClient.programId,
        }
      }
    );

    const shareWalletAccount = await serumCmn.getTokenAccount(program.provider, shareWallet);
    assert.ok(shareWalletAccount.amount.eqn(0));

    const targetWalletAccount = await serumCmn.getTokenAccount(program.provider, fundingWallet);
    assert.ok(targetWalletAccount.amount.eqn(100));
  });
});
