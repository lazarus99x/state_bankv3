"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

export interface BankAccount {
  id: string;
  user_id: string;
  account_number: string;
  account_name: string;
  account_type: string;
  currency: string;
  balance: number;
  status: string;
  created_at: string;
}

interface AccountsResult {
  accounts: BankAccount[];
  loading: boolean;
  totalBalance: number;
  fmt: (n: number) => string;
}

interface TransactionsResult {
  transactions: any[];
  loading: boolean;
}

export function useAccounts(): AccountsResult {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !mounted) { setLoading(false); return; }
      supabase
        .from("accounts")
        .select("*")
        .eq("user_id", user.id)
        .then(({ data, error }) => {
          if (!mounted) return;
          if (!error && data) setAccounts(data as BankAccount[]);
          setLoading(false);
        });
    });
    return () => { mounted = false; };
  }, []);

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const fmt = useCallback((n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n), []);

  return { accounts, loading, totalBalance, fmt };
}

export function useRecentTransactions(limit = 5): TransactionsResult {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !mounted) { setLoading(false); return; }
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit)
        .then(({ data, error }) => {
          if (!mounted) return;
          if (!error && data) setTransactions(data);
          setLoading(false);
        });
    });
    return () => { mounted = false; };
  }, [limit]);

  return { transactions, loading };
}