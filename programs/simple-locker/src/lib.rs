use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("He1q6sv6cKGp5Pcns1VDzZ2pruCtWkNwkqjCx9gTfXSM");

#[error]
pub enum ErrorCode {
    IntegerOverflow,
    NothingToLock,
    InvalidAmountTransferred,
    InvalidAmount,
    InitMintInfoNotAuthorized,
}


#[program]
pub mod simple_locker {
    use super::*;

    pub fn create(ctx: Context<Create>, authority: Pubkey) -> ProgramResult {
        

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> ProgramResult {

        

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Create {}

#[derive(Accounts)]
pub struct Withdraw {}

#[account]
pub struct SimpleLocker {
    owner: Pubkey,
    creator: Pubkey,
    amount: u64,
    vault: Pubkey,
    vault_bump: u8,
    locker_bump: u8,
}
