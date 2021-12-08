use std::ops::DerefMut;

use anchor_lang::{
    prelude::*,
    solana_program::{
        self,
        log::{sol_log, sol_log_64},
    },
    AccountsClose,
};
use anchor_spl::{
    associated_token::get_associated_token_address,
    token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer},
};

use az::CheckedAs;

declare_id!("He1q6sv6cKGp5Pcns1VDzZ2pruCtWkNwkqjCx9gTfXSM");

#[error]
pub enum ErrorCode {
    #[msg("The given unlock date is in the past")]
    UnlockInThePast,
    InvalidTimestamp,
    IntegerOverflow,
    NothingToLock,
    InvalidAmountTransferred,
    InvalidPeriod,
    CannotUnlockToEarlierDate,
    TooEarlyToWithdraw,
    InvalidAmount,
    LinearEmissionDisabled,
}


#[program]
pub mod simple_locker {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, args: CreateConfigArgs) -> Result<()> {
        let config = ctx.accounts.config.deref_mut();

        *config = Config {
            admin: ctx.accounts.admin.key(),
            has_linear_emission: args.has_linear_emission,
            bump: args.bump,
        };

        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, args: UpdateConfigArgs) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let UpdateConfigArgs {
            has_linear_emission,
        } = args;

        config.has_linear_emission = has_linear_emission.unwrap_or(config.has_linear_emission);

        Ok(())
    }

    pub fn create_locker<'info>(
        ctx: Context<'_, '_, '_, 'info, CreateLocker<'info>>,
        args: CreateLockerArgs,
    ) -> Result<()> {
        sol_log("Create locker: start");

        let now = ctx.accounts.clock.unix_timestamp;
        require!(args.unlock_date > now, UnlockInThePast);

        require!(args.unlock_date < 10000000000, InvalidTimestamp);

        let config = &ctx.accounts.config;

        if !config.has_linear_emission {
            require!(args.start_emission.is_none(), LinearEmissionDisabled);
        }

        if let Some(start_emission) = args.start_emission {
            require!(args.unlock_date > start_emission, InvalidPeriod);
        }

        require!(args.amount > 0, NothingToLock);

        let locker = ctx.accounts.locker.deref_mut();

        *locker = Locker {
            owner: ctx.accounts.owner.key(),
            current_unlock_date: args.unlock_date,
            start_emission: args.start_emission,
            deposited_amount: args.amount,
            vault: ctx.accounts.vault.key(),
            vault_bump: args.vault_bump,
            creator: ctx.accounts.creator.key(),
            original_unlock_date: args.unlock_date,
            locker_bump: args.locker_bump,
        };

        TokenTransfer {
            amount: args.amount,
            from: &mut ctx.accounts.funding_wallet,
            to: &ctx.accounts.vault,
            authority: &ctx.accounts.funding_wallet_authority,
            token_program: &ctx.accounts.token_program,
            signers: None,
        }
        .make()?;

        Ok(())
    }

    pub fn relock(ctx: Context<Relock>, unlock_date: i64) -> Result<()> {
        let locker = &mut ctx.accounts.locker;

        require!(
            unlock_date > locker.current_unlock_date,
            CannotUnlockToEarlierDate
        );

        locker.current_unlock_date = unlock_date;

        Ok(())
    }

    pub fn transfer_ownership(ctx: Context<TransferOwnership>) -> Result<()> {
        let locker = &mut ctx.accounts.locker;

        locker.owner = ctx.accounts.new_owner.key();

        Ok(())
    }

    pub fn increment_lock(ctx: Context<IncrementLock>, amount: u64) -> Result<()> {
        let locker = &mut ctx.accounts.locker;

        TokenTransfer {
            amount: amount,
            from: &mut ctx.accounts.funding_wallet,
            to: &ctx.accounts.vault,
            authority: &ctx.accounts.funding_wallet_authority,
            token_program: &ctx.accounts.token_program,
            signers: None,
        }
        .make()?;

        locker.deposited_amount = locker
            .deposited_amount
            .checked_add(amount)
            .ok_or(ErrorCode::IntegerOverflow)?;

        Ok(())
    }

    pub fn withdraw_funds(ctx: Context<WithdrawFunds>, amount: u64) -> Result<()> {
        let now = ctx.accounts.clock.unix_timestamp;
        let locker = &ctx.accounts.locker;
        let vault = &mut ctx.accounts.vault;   
        
        let amount_to_transfer = match locker.start_emission {
            Some(start_emission) => {
                let clamped_time = now.clamp(start_emission, locker.current_unlock_date);
                let elapsed = clamped_time - start_emission;
                let full_period = locker.current_unlock_date - start_emission;
                require!(full_period > 0, InvalidPeriod);

                sol_log_64(
                    amount,
                    elapsed as u64,
                    full_period as u64,
                    now as u64,
                    start_emission as u64,
                );

                mul_div(locker.deposited_amount, elapsed, full_period as u64)
                    .ok_or(ErrorCode::IntegerOverflow)?
                    .min(amount)
            }
            None => {
                require!(now > locker.current_unlock_date, TooEarlyToWithdraw);
                amount.min(vault.amount)
            }
        };

        require!(amount_to_transfer > 0, InvalidAmount);
        require!(amount_to_transfer <= vault.amount, InvalidAmount);

        let locker_key = locker.key();
        let seeds = &[locker_key.as_ref(), &[locker.vault_bump]];
        let signers = &[&seeds[..]];

        TokenTransfer {
            amount: amount_to_transfer,
            from: vault,
            to: &ctx.accounts.target_wallet,
            authority: &ctx.accounts.vault_authority,
            token_program: &ctx.accounts.token_program,
            signers: Some(signers),
        }
        .make()?;

        vault.reload()?;
        if vault.amount == 0 {
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                CloseAccount {
                    account: vault.to_account_info(),
                    destination: ctx.accounts.owner.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signers,
            );
            token::close_account(cpi_ctx)?;

            locker.close(ctx.accounts.owner.to_account_info())?;
        }

        Ok(())
    }

    pub fn split_locker(ctx: Context<SplitLocker>, args: SplitLockerArgs) -> Result<()> {
        require!(args.amount > 0, InvalidAmount);

        let new_locker = ctx.accounts.new_locker.deref_mut();
        let old_locker = &mut ctx.accounts.old_locker;
        let old_vault = &mut ctx.accounts.old_vault;

        require!(args.amount <= old_vault.amount, InvalidAmount);

        let locker_key = old_locker.key();
        let seeds = &[locker_key.as_ref(), &[old_locker.vault_bump]];
        let signers = &[&seeds[..]];

        TokenTransfer {
            amount: args.amount,
            from: old_vault,
            to: &ctx.accounts.new_vault,
            authority: &ctx.accounts.old_vault_authority,
            token_program: &ctx.accounts.token_program,
            signers: Some(signers),
        }
        .make()?;

        old_locker.deposited_amount = old_locker
            .deposited_amount
            .checked_sub(args.amount)
            .ok_or(ErrorCode::IntegerOverflow)?;

        old_vault.reload()?;
        if old_vault.amount == 0 {
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                CloseAccount {
                    account: old_vault.to_account_info(),
                    destination: ctx.accounts.old_owner.to_account_info(),
                    authority: ctx.accounts.old_vault_authority.to_account_info(),
                },
                signers,
            );
            token::close_account(cpi_ctx)?;

            old_locker.close(ctx.accounts.old_owner.to_account_info())?;
        }

        *new_locker = Locker {
            owner: ctx.accounts.new_owner.key(),
            current_unlock_date: old_locker.current_unlock_date,
            start_emission: old_locker.start_emission,
            deposited_amount: args.amount,
            vault: ctx.accounts.new_vault.key(),
            vault_bump: args.vault_bump,
            creator: ctx.accounts.old_owner.key(),
            original_unlock_date: old_locker.current_unlock_date,
            locker_bump: args.locker_bump,
        };

        Ok(())
    }
}


#[account]
#[derive(Debug)]
pub struct Config {
    admin: Pubkey,
    has_linear_emission: bool,
    bump: u8,
}

impl Config {
    pub const LEN: usize = 8 + std::mem::size_of::<Self>();
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct CreateConfigArgs {
    pub has_linear_emission: bool,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(args: CreateConfigArgs)]
pub struct InitConfig<'info> {
    #[account(signer)]
    admin: AccountInfo<'info>,
    #[account(
        init,
        payer = admin,
        seeds = [
            "config".as_ref()
        ],
        bump = args.bump,
        space = Config::LEN
    )]
    config: ProgramAccount<'info, Config>,

    system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct UpdateConfigArgs {
    has_linear_emission: Option<bool>,
}

#[derive(Accounts)]
#[instruction(args: UpdateConfigArgs)]
pub struct UpdateConfig<'info> {
    #[account(signer)]
    admin: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [
            "config".as_ref()
        ],
        bump = config.bump,
        constraint = config.admin == admin.key()
    )]
    config: ProgramAccount<'info, Config>,
}

#[account]
pub struct Locker {
    owner: Pubkey,
    current_unlock_date: i64,
    start_emission: Option<i64>,
    deposited_amount: u64,
    vault: Pubkey,
    vault_bump: u8,
    creator: Pubkey,
    original_unlock_date: i64,
    locker_bump: u8,
}

impl Locker {
    pub const LEN: usize = std::mem::size_of::<Self>() + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateLockerArgs {
    amount: u64,
    unlock_date: i64,
    start_emission: Option<i64>,
    locker_bump: u8,
    vault_bump: u8,
}

#[derive(Accounts)]
#[instruction(args: CreateLockerArgs)]
pub struct CreateLocker<'info> {
    #[account(
        init,
        payer = creator,
        seeds = [
            creator.key().as_ref(),
            args.unlock_date.to_be_bytes().as_ref(),
            args.amount.to_be_bytes().as_ref(),
        ],
        bump = args.locker_bump,
        space = Locker::LEN,
    )]
    locker: ProgramAccount<'info, Locker>,
    #[account(signer)]
    creator: AccountInfo<'info>,
    owner: AccountInfo<'info>,
    #[account(signer)]
    funding_wallet_authority: AccountInfo<'info>,
    #[account(mut)]
    funding_wallet: Account<'info, TokenAccount>,
    #[account(
        seeds = [
            locker.key().as_ref()
        ],
        bump = args.vault_bump
    )]
    vault_authority: AccountInfo<'info>,
    #[account(
        mut,
        constraint = vault.mint == funding_wallet.mint
    )]
    vault: Account<'info, TokenAccount>,
    config: ProgramAccount<'info, Config>,
    clock: Sysvar<'info, Clock>,
    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Relock<'info> {
    #[account(mut)]
    locker: ProgramAccount<'info, Locker>,
    #[account(
        signer,
        constraint = locker.owner == owner.key()
    )]
    owner: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct TransferOwnership<'info> {
    #[account(mut)]
    locker: ProgramAccount<'info, Locker>,
    #[account(
        signer,
        constraint = locker.owner == owner.key()
    )]
    owner: AccountInfo<'info>,
    new_owner: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct IncrementLock<'info> {
    #[account(mut)]
    locker: ProgramAccount<'info, Locker>,
    #[account(
        mut,
        constraint = vault.mint == funding_wallet.mint,
        constraint = locker.vault == vault.key()
    )]
    vault: Account<'info, TokenAccount>,
    #[account(signer)]
    funding_wallet_authority: AccountInfo<'info>,
    #[account(mut)]
    funding_wallet: Account<'info, TokenAccount>,

    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawFunds<'info> {
    #[account(mut)]
    locker: ProgramAccount<'info, Locker>,
    #[account(
        signer,
        constraint = locker.owner == owner.key()
    )]
    owner: AccountInfo<'info>,
    vault_authority: AccountInfo<'info>,
    #[account(
        mut,
        constraint = vault.owner == vault_authority.key()
    )]
    vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = target_wallet.mint == vault.mint
    )]
    target_wallet: Account<'info, TokenAccount>,

    clock: Sysvar<'info, Clock>,
    token_program: Program<'info, Token>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SplitLockerArgs {
    locker_bump: u8,
    vault_bump: u8,
    amount: u64,
}

#[derive(Accounts)]
#[instruction(args: SplitLockerArgs)]
pub struct SplitLocker<'info> {
    #[account(mut)]
    old_locker: ProgramAccount<'info, Locker>,
    #[account(
        signer,
        constraint = old_locker.owner == old_owner.key()
    )]
    old_owner: AccountInfo<'info>,
    old_vault_authority: AccountInfo<'info>,
    #[account(
        mut,
        constraint = old_vault.owner == old_vault_authority.key()
    )]
    old_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = old_owner,
        seeds = [
            old_locker.key().as_ref(),
            old_locker.current_unlock_date.to_be_bytes().as_ref(),
            args.amount.to_be_bytes().as_ref()
        ],
        bump = args.locker_bump,
        space = Locker::LEN,
    )]
    new_locker: ProgramAccount<'info, Locker>,
    new_owner: AccountInfo<'info>,
    #[account(
        seeds = [
            new_locker.key().as_ref()
        ],
        bump = args.vault_bump
    )]
    new_vault_authority: AccountInfo<'info>,
    #[account(
        mut,
        constraint = new_vault.mint == old_vault.mint
    )]
    new_vault: Account<'info, TokenAccount>,

    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
}


/// floor(a * b / denominator)
pub fn mul_div<SrcA, SrcB, SrcD>(a: SrcA, b: SrcB, denominator: SrcD) -> Option<u64>
where
    SrcA: fixed::traits::ToFixed,
    SrcB: fixed::traits::ToFixed,
    SrcD: fixed::traits::ToFixed,
{
    use fixed::types::U64F64;

    let a = U64F64::from_num(a);
    let b = U64F64::from_num(b);
    let denominator = U64F64::from_num(denominator);

    a.checked_mul(b)
        .and_then(|r| r.checked_div(denominator))
        .and_then(|r| r.floor().checked_as::<u64>())
}

struct TokenTransfer<'pay, 'info> {
    amount: u64,
    from: &'pay mut Account<'info, TokenAccount>,
    to: &'pay Account<'info, TokenAccount>,
    authority: &'pay AccountInfo<'info>,
    token_program: &'pay Program<'info, Token>,
    signers: Option<&'pay [&'pay [&'pay [u8]]]>,
}

impl TokenTransfer<'_, '_> {
    fn make(self) -> Result<()> {
        let amount_before = self.from.amount;

        self.from.key().log();
        self.to.key().log();
        self.authority.key().log();

        let cpi_ctx = CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.from.to_account_info(),
                to: self.to.to_account_info(),
                authority: self.authority.to_account_info(),
            },
        );
        let cpi_ctx = match self.signers {
            Some(signers) => cpi_ctx.with_signer(signers),
            None => cpi_ctx,
        };

        token::transfer(cpi_ctx, self.amount)?;

        self.from.reload()?;
        let amount_after = self.from.amount;

        sol_log_64(amount_before, amount_after, self.amount, 0, 0);

        require!(
            amount_before - amount_after == self.amount,
            InvalidAmountTransferred
        );

        Ok(())
    }
}