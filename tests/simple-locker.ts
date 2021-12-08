import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { SimpleLocker } from '../target/types/simple_locker';

describe('simple-locker', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SimpleLocker as Program<SimpleLocker>;

  it('Is initialized!', async () => {
    // Add your test here.
    const tx = await program.rpc.initialize({});
    console.log("Your transaction signature", tx);
  });
});