use std::ops::DerefMut;

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, InitializeMint, Mint, MintTo, Token, TokenAccount};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[error]
pub enum ErrorCode {
    InvalidMint,
}

#[program]
pub mod share_token_distributor {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        let distributor = ctx.accounts.distributor.deref_mut();

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint {
                mint: ctx.accounts.share_token_mint.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        );
        token::initialize_mint(cpi_ctx, 0, &ctx.accounts.mint_authority.key(), None)?;

        *distributor = Distributor {
            share_token_mint: ctx.accounts.share_token_mint.key(),
            owner: ctx.accounts.owner.key(),
            locker: ctx.accounts.locker.key(),
            mint_bump: args.mint_bump,
            mint_authority_bump: args.mint_authority_bump,
            locker_authority_bump: args.locker_authority_bump,
        };

        Ok(())
    }

    pub fn add_share(ctx: Context<AddShare>, amount: u64) -> Result<()> {
        let distributor = &ctx.accounts.distributor;

        let seeds = &[
            distributor.share_token_mint.as_ref(),
            &[distributor.mint_authority_bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.share_token_mint.to_account_info(),
                to: ctx.accounts.target_wallet.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer,
        );
        token::mint_to(cpi_ctx, amount)?;

        Ok(())
    }

    pub fn exchange(ctx: Context<Exchange>, amount: u64) -> Result<()> {
        let target_wallet = &mut ctx.accounts.target_wallet;

        let amount_before = target_wallet.amount;
        let cpi_ctx = CpiContext::new(
            ctx.accounts.locker_program.to_account_info(),
            simple_locker::cpi::accounts::WithdrawFunds {
                locker: ctx.accounts.locker.to_account_info(),
                owner: ctx.accounts.locker_authority.to_account_info(),
                vault_authority: ctx.accounts.vault_authority.to_account_info(),
                vault: ctx.accounts.vault.to_account_info(),
                target_wallet: target_wallet.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
        );
        simple_locker::cpi::withdraw_funds(cpi_ctx, amount)?;

        target_wallet.reload()?;
        let amount_after = target_wallet.amount;
        // Actual withdrawn amount can be less than requested amount
        // if the locker is configured with linear emission.
        let share_amount = amount_after - amount_before;

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.share_token_mint.to_account_info(),
                to: ctx.accounts.share_wallet.to_account_info(),
                authority: ctx.accounts.share_wallet_authority.to_account_info(),
            },
        );
        token::burn(cpi_ctx, share_amount)?;

        Ok(())
    }
}

#[account]
pub struct Distributor {
    share_token_mint: Pubkey,
    locker: Pubkey,
    owner: Pubkey,
    mint_bump: u8,
    mint_authority_bump: u8,
    locker_authority_bump: u8,
}

impl Distributor {
    pub const LEN: usize = 8 + std::mem::size_of::<Self>();
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct InitializeArgs {
    mint_bump: u8,
    mint_authority_bump: u8,
    locker_authority_bump: u8,
}

#[derive(Accounts)]
#[instruction(args: InitializeArgs)]
pub struct Initialize<'info> {
    #[account(signer)]
    owner: AccountInfo<'info>,
    #[account(
        init,
        payer = owner,
        space = Distributor::LEN
    )]
    distributor: Account<'info, Distributor>,
    #[account(
        init,
        payer = owner,
        space = Mint::LEN,
        seeds = [
            distributor.key().as_ref()
        ],
        bump = args.mint_bump,
        owner = Token::id(),
    )]
    share_token_mint: AccountInfo<'info>,
    #[account(
        seeds = [
            share_token_mint.key().as_ref(),
        ],
        bump = args.mint_authority_bump
    )]
    mint_authority: AccountInfo<'info>,

    #[account(
        constraint = locker.owner == locker_authority.key()
    )]
    locker: Account<'info, simple_locker::Locker>,
    #[account(
        seeds = [
            locker.key().as_ref(),
        ],
        bump = args.locker_authority_bump
    )]
    locker_authority: AccountInfo<'info>,

    rent: Sysvar<'info, Rent>,
    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddShare<'info> {
    #[account(signer)]
    owner: AccountInfo<'info>,
    distributor: Account<'info, Distributor>,

    #[account(
        mut,
        constraint = share_token_mint.key() == distributor.share_token_mint
            @ ErrorCode::InvalidMint
    )]
    share_token_mint: Account<'info, Mint>,
    #[account(
        seeds = [
            share_token_mint.key().as_ref(),
        ],
        bump = distributor.mint_authority_bump
    )]
    mint_authority: AccountInfo<'info>,
    #[account(
        mut,
        constraint = target_wallet.mint == share_token_mint.key()
    )]
    target_wallet: Account<'info, TokenAccount>,

    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Exchange<'info> {
    #[account(signer)]
    shareholder: AccountInfo<'info>,
    distributor: Account<'info, Distributor>,

    #[account(
        mut,
        constraint = share_token_mint.key() == distributor.share_token_mint
            @ ErrorCode::InvalidMint
    )]
    share_token_mint: Account<'info, Mint>,
    #[account(
        seeds = [
            share_token_mint.key().as_ref(),
        ],
        bump = distributor.mint_authority_bump
    )]
    mint_authority: AccountInfo<'info>,

    #[account(
        mut,
        constraint = share_wallet.mint == share_token_mint.key()
    )]
    share_wallet: Account<'info, TokenAccount>,
    #[account(signer)]
    share_wallet_authority: AccountInfo<'info>,

    #[account(
        mut,
        constraint = distributor.locker == locker.key()
    )]
    locker: Account<'info, simple_locker::Locker>,
    #[account(
        seeds = [
            locker.key().as_ref(),
        ],
        bump = distributor.locker_authority_bump
    )]
    locker_authority: AccountInfo<'info>,

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

    token_program: Program<'info, Token>,
    locker_program: Program<'info, simple_locker::program::SimpleLocker>,
}
