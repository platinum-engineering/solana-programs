import * as anchor from '@project-serum/anchor';
import * as spl from "@solana/spl-token";
import * as serumCmn from "@project-serum/common";
import * as assert from 'assert';

import { SimpleLocker } from '../target/types/simple_locker';
import { Client } from "../web3/simple_locker/index";

async function createMint(provider: anchor.Provider, authority?: anchor.web3.PublicKey) {
  if (authority === undefined) {
    authority = provider.wallet.publicKey;
  }
  const mint = await spl.Token.createMint(
    provider.connection,
    provider.wallet.payer,
    authority,
    null,
    6,
    spl.TOKEN_PROGRAM_ID,
  );
  return mint;
}

describe('locker', () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SimpleLocker as anchor.Program<SimpleLocker>;
  const creator = provider.wallet.publicKey;
  const unlockDate = new anchor.BN(Date.now() / 1000 + 4);
  const newOwner = anchor.web3.Keypair.generate();
  const client = new Client(provider, Client.TOKEN_LOCKER, Client.LOCALNET);
  const feeWallet = new anchor.web3.PublicKey("7vPbNKWdgS1dqx6ZnJR8dU9Mo6Tsgwp3S5rALuANwXiJ");

  let
    mint: spl.Token,
    fundingWallet: anchor.web3.PublicKey;

  it('Creates locker', async () => {
    mint = await createMint(provider);
    fundingWallet = await serumCmn.createTokenAccount(
      provider,
      mint.publicKey,
      provider.wallet.publicKey,
    );

    const [config, configBump] = await client.findConfigAddress();

    await program.rpc.initConfig(
      {
        feeInSol: new anchor.BN(1),
        feeInTokenNumerator: new anchor.BN(35),
        feeInTokenDenominator: new anchor.BN(10000),
        mintInfoPermissioned: false,
        bump: configBump
      },
      {
        accounts: {
          admin: provider.wallet.publicKey,
          config,
          feeWallet,
          systemProgram: anchor.web3.SystemProgram.programId,
        }
      }
    );

    await mint.mintTo(fundingWallet, provider.wallet.publicKey, [], 11000);

    await client.createLocker({
      unlockDate,
      amount: new anchor.BN(10000),
      creator: creator,
      owner: creator,
      fundingWalletAuthority: creator,
      fundingWallet: fundingWallet,
      feeInSol: true,
    });

    const lockers = await program.account.locker.all();

    const lockerAccount = lockers[0];
    console.log('Locker: ', lockerAccount);

    assert.ok(lockerAccount.account.owner.equals(creator));
    assert.ok(lockerAccount.account.creator.equals(creator));
    assert.ok(lockerAccount.account.currentUnlockDate.eq(unlockDate));
    assert.ok(lockerAccount.account.originalUnlockDate.eq(unlockDate));

    const fundingWalletAccount = await serumCmn.getTokenAccount(provider, fundingWallet);
    console.log(fundingWalletAccount.amount.toNumber());
    assert.ok(fundingWalletAccount.amount.eqn(1000));

    const vaultAccount = await serumCmn.getTokenAccount(provider, lockerAccount.account.vault);
    assert.ok(vaultAccount.amount.eqn(10000));
  });

  it('Fails to withdraw funds if it is too early', async () => {
    const lockers = await program.account.locker.all();
    const lockerAccount = lockers[0];

    await assert.rejects(
      async () => await client.withdrawFunds({
        amount: new anchor.BN(100),
        locker: lockerAccount,
        targetWallet: fundingWallet,
      }),
      (err) => {
        assert.equal(err.code, 6007);
        return true;
      }
    )
  });

  it('Relocks the locker', async () => {
    const lockers = await program.account.locker.all();
    const lockerAccountBefore = lockers[0];

    const newUnlockDate = unlockDate.addn(1);

    await client.relock({
      unlockDate: newUnlockDate,
      locker: lockerAccountBefore,
    });

    const lockerAccountAfter = await program.account.locker.fetch(lockerAccountBefore.publicKey);
    assert.ok(!lockerAccountAfter.currentUnlockDate.eq(lockerAccountAfter.originalUnlockDate));
    assert.ok(lockerAccountAfter.currentUnlockDate.eq(newUnlockDate));
  });

  it('Transfers the ownership', async () => {
    const lockers = await program.account.locker.all();
    const lockerAccountBefore = lockers[0];

    await client.transferOwnership({
      locker: lockerAccountBefore,
      newOwner: newOwner.publicKey,
    });

    const lockerAccountAfter = await program.account.locker.fetch(lockerAccountBefore.publicKey);
    assert.ok(lockerAccountAfter.owner.equals(newOwner.publicKey));

    await client.transferOwnership({
      locker: {
        publicKey: lockerAccountBefore.publicKey,
        account: lockerAccountAfter,
      },
      newOwner: lockerAccountBefore.account.owner,
      signers: [newOwner],
    });

    const lockerAccountFinal = await program.account.locker.fetch(lockerAccountBefore.publicKey);
    assert.ok(lockerAccountFinal.owner.equals(lockerAccountBefore.account.owner));
  });

  it('Increments the lock', async () => {
    const lockers = await program.account.locker.all();
    const lockerAccountBefore = lockers[0];

    await client.incrementLock({
      amount: new anchor.BN(1000),
      locker: lockerAccountBefore,
      fundingWallet,
      fundingWalletAuthority: provider.wallet.publicKey,
    });

    const lockerAccountFinal = await program.account.locker.fetch(lockerAccountBefore.publicKey);
    assert.ok(lockerAccountFinal.depositedAmount.eqn(11000));
  });

  it('Splits the locker', async () => {
    let lockers = await program.account.locker.all();
    const locker = lockers[0];

    const amount = new anchor.BN(1000);

    const [newLocker, _newVault] = await client.splitLocker({
      amount,
      locker,
      newOwner: newOwner.publicKey,
    });

    const newLockerAccount = await client.program.account.locker.fetch(newLocker);
    assert.ok(newLockerAccount.depositedAmount.eq(amount));

    const oldVaultAccount = await serumCmn.getTokenAccount(provider, locker.account.vault);
    console.log(oldVaultAccount.amount.toNumber());
    assert.ok(oldVaultAccount.amount.eqn(10000));
  });

  it('Withdraws the funds', async () => {
    const lockers = await client.getLockersOwnedBy(provider.wallet.publicKey);
    const lockerAccount = lockers[0];

    const amount = new anchor.BN(1000);

    while (true) {
      try {
        await client.withdrawFunds({
          amount,
          locker: lockerAccount,
          targetWallet: provider.wallet.publicKey,
          createAssociated: true,
        });
        break;
      } catch (err) {
        assert.equal(err.code, 6007); // TooEarlyToWithdraw
        await serumCmn.sleep(1000);
      }
    }

    const targetWalletAddress = await anchor.utils.token.associatedAddress({ mint: mint.publicKey, owner: provider.wallet.publicKey });
    const targetWallet = await serumCmn.getTokenAccount(provider, targetWalletAddress);
    assert.ok(targetWallet.amount.eq(amount));

    const vaultWallet = await serumCmn.getTokenAccount(provider, lockerAccount.account.vault);
    // 10000 - 1000 (gone in a split) - 1000 (withdraw amount)
    assert.ok(vaultWallet.amount.eqn(9000));

    await client.withdrawFunds({
      amount: new anchor.BN(9000),
      locker: lockerAccount,
      targetWallet: provider.wallet.publicKey,
      createAssociated: true,
    });

    assert.rejects(
      async () => {
        await serumCmn.getTokenAccount(provider, lockerAccount.account.vault);
      },
      (err) => {
        assert.ok(err.message == "Failed to find token account");
      }
    );
  });
});