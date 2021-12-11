import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';

import { ShareTokenDistributor } from '../target/types/share_token_distributor';

describe('share-token-distributor', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SimpleLocker as Program<ShareTokenDistributor>;

  it('Is initialized!', async () => {
    // Add your test here.
    const tx = await program.rpc.initialize({});
    console.log("Your transaction signature", tx);
  });
});
