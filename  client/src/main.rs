use anchor_client::solana_sdk::commitment_config::CommitmentConfig;
use anchor_client::solana_sdk::pubkey::Pubkey;
use anchor_client::solana_sdk::signature::read_keypair_file;
use anchor_client::solana_sdk::signature::{Keypair, Signer};
use anchor_client::solana_sdk::system_instruction;
use anchor_client::{Client, Cluster};

use anyhow::Result;
use solana_sdk::system_program;

use simple_locker::accounts as locker_accs;
use simple_locker::instruction as locker_instruction;

use clap::Parser;
use rand::rngs::OsRng;


#[derive(Parser, Debug)]
pub struct Opts {
    #[clap(long, default_value="He1q6sv6cKGp5Pcns1VDzZ2pruCtWkNwkqjCx9gTfXSM")]
    pid: Pubkey,
}

fn main() -> Result<()> {
    
    let opts = Opts::parse();

    let payer = read_keypair_file(&*shellexpand::tilde("~/.config/solana/id.json"))
        .expect("need to load a keypair file as payer account");

    let url = Cluster::Devnet;

    let client = Client::new_with_options(url, payer, CommitmentConfig::processed());

    create(&client, opts.pid)?;

    Ok(())
}

fn create(client: &Client, pid: Pubkey) -> Result<()> {
    let program = client.program(pid);

    let locker = Keypair::generate(&mut OsRng);
    let authority = program.payer();

    program
        .request()
        .signer(&locker)
        .accounts(locker_accs::Create {
            counter: locker.pubkey(),
            user: authority,
            system_program: system_program::ID,
        })
        .args(locker_instruction::Create { authority })
        .send()?;

    let locker_account: SimpleLocker = program.account(locker.pubkey())?;

    assert_eq!(locker_account.owner, authority);
    assert_eq!(locker_account.amount, 0);

    println!("Locker creation success!");

    Ok(())
}

fn withdraw(client: &Client, pid: Pubkey) -> Result<()> {
    Ok(())
}
