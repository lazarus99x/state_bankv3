import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin-supabase";

export async function POST(request: Request) {
  try {
    const { action, userId, data } = await request.json();

    // userId is profile UUID (u.id from admin page)
    // bank_accounts.user_id = profiles.id = profile UUID
    // profiles.user_id = auth UUID (different!)

    switch (action) {
      case "ban":
        await adminClient.from("bank_accounts").update({ status: "frozen" }).eq("user_id", userId).eq("status", "active");
        return NextResponse.json({ success: true, message: "Account frozen" });

      case "unban":
        await adminClient.from("bank_accounts").update({ status: "active" }).eq("user_id", userId).eq("status", "frozen");
        return NextResponse.json({ success: true, message: "Account unfrozen" });

      case "delete":
        await adminClient.from("bank_accounts").update({ status: "closed" }).eq("user_id", userId).eq("status", "active");
        return NextResponse.json({ success: true, message: "Accounts closed" });

      case "verify_kyc": {
        // profiles.user_id is auth UUID — resolve from profile UUID
        const { data: profile } = await adminClient
          .from("profiles")
          .select("user_id")
          .eq("id", userId)
          .single();
        if (!profile) return NextResponse.json({ success: false, error: "Profile not found" });
        await adminClient.from("profiles").update({ kyc_status: "verified" }).eq("user_id", profile.user_id);
        return NextResponse.json({ success: true, message: "KYC verified" });
      }

      case "assign_number": {
        const { generateAccountNumber } = await import("@/lib/account-number");
        const num = await generateAccountNumber();
        const { data: accts, error: findErr } = await adminClient
          .from("bank_accounts")
          .select("id")
          .eq("user_id", userId);
        if (findErr) return NextResponse.json({ success: false, error: findErr.message });
        if (accts?.length) {
          const acct = accts[0];
          await adminClient.from("bank_accounts").update({ account_number: num }).eq("id", acct.id);
          return NextResponse.json({ success: true, message: `Assigned ${num}`, accountNumber: num });
        }
        // No accounts exist — create one
        const { error: createErr } = await adminClient.from("bank_accounts").insert({
          user_id: userId,
          account_number: num,
          account_name: "Admin-created account",
          account_type: "checking",
          currency: "USD",
          balance: 0,
          ledger_balance: 0,
          status: "active",
          daily_withdrawal_limit: 10000,
          monthly_withdrawal_limit: 50000,
        });
        if (createErr) return NextResponse.json({ success: false, error: `Account creation failed: ${createErr.message}` });
        return NextResponse.json({ success: true, message: `Account created with #${num}`, accountNumber: num });
      }

      case "limits":
        await adminClient.from("bank_accounts")
          .update({ daily_withdrawal_limit: data?.dailyLimit || 10000, monthly_withdrawal_limit: data?.monthlyLimit || 50000 })
          .eq("user_id", userId);
        return NextResponse.json({ success: true, message: "Limits updated" });

      case "withdraw": {
        const amount = data?.amount || 0;
        if (amount <= 0) {
          return NextResponse.json({ success: false, error: "Invalid withdrawal amount" });
        }
        const { data: accts, error: findErr } = await adminClient
          .from("bank_accounts")
          .select("*")
          .eq("user_id", userId)
          .eq("status", "active");
        if (findErr || !accts?.length) {
          return NextResponse.json({ success: false, error: "No active accounts" });
        }
        const account = accts[0];
        const newBalance = Number(account.balance) - amount;
        if (newBalance < 0) {
          return NextResponse.json({ success: false, error: "Insufficient balance" });
        }
        const ref = `WD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const txPayload: any = {
          transaction_ref: ref,
          type: "withdrawal",
          status: "completed",
          amount,
          from_account_id: account.id,
          from_balance_before: account.balance,
          from_balance_after: newBalance,
          description: data?.description || "Withdrawal",
          initiated_by: "admin",
        };
        if (data?.backdated_at) {
          txPayload.created_at = data.backdated_at;
          txPayload.completed_at = data.backdated_at;
        }
        await adminClient.from("transactions").insert(txPayload);
        await adminClient.from("bank_accounts").update({ balance: newBalance, ledger_balance: newBalance }).eq("id", account.id);
        return NextResponse.json({ success: true, message: `$${amount.toFixed(2)} withdrawn. New balance: $${newBalance.toFixed(2)}` });
      }

      case "bypass_pov": {
        if (!data?.transactionId) {
          return NextResponse.json({ success: false, error: "Missing transactionId" });
        }
        await adminClient
          .from("transactions")
          .update({ pov_verified: true })
          .eq("id", data.transactionId);
        return NextResponse.json({ success: true, message: "POV verification bypassed" });
      }

      default:
        return NextResponse.json({ success: false, error: "Unknown action" });
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || "Action failed" });
  }
}