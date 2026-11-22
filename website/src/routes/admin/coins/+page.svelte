<script lang="ts">
    import { onMount } from 'svelte';
    import * as Card from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Textarea } from '$lib/components/ui/textarea';
    import { Badge } from '$lib/components/ui/badge';
    import { toast } from 'svelte-sonner';

    interface Coin {
        id: number;
        name: string;
        symbol: string;
        isListed: boolean;
        marketCap: string;
        currentPrice: string;
        volume24h: string | null;
        creatorUsername: string | null;
    }
    interface History {
        id: number;
        adminUsername: string;
        coinName: string;
        coinSymbol: string;
        action: string;
        reason: string;
        createdAt: string;
    }

    let search = $state('');
    let coins = $state<Coin[]>([]);
    let history = $state<History[]>([]);
    let loading = $state(false);
    let submitting = $state(false);
    let pending = $state<{ coin: Coin; action: 'delist' | 'relist' } | null>(null);
    let reason = $state('');

    async function loadCoins(query = search) {
        loading = true;
        try {
            const response = await fetch(`/api/admin/coins?q=${encodeURIComponent(query.trim())}`);
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.message || result.error || 'Could not load coins');
            coins = result.coins ?? [];
            history = result.history ?? [];
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not load coins');
        } finally {
            loading = false;
        }
    }

    function beginAction(entry: Coin) {
        pending = { coin: entry, action: entry.isListed ? 'delist' : 'relist' };
        reason = '';
    }

    async function applyAction() {
        if (!pending || submitting) return;
        const chosen = pending;
        if (reason.trim().length < 3) {
            toast.error('Enter a moderation reason (at least 3 characters)');
            return;
        }
        const verb = chosen.action === 'delist' ? 'Take down' : 'Restore';
        if (!window.confirm(`${verb} ${chosen.coin.name} (*${chosen.coin.symbol})?`)) return;

        submitting = true;
        try {
            const response = await fetch('/api/admin/coins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coinId: chosen.coin.id,
                    action: chosen.action,
                    reason: reason.trim()
                })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.message || result.error || 'Moderation failed');
            toast.success(chosen.action === 'delist' ? 'Coin taken down' : 'Coin restored');
            pending = null;
            reason = '';
            await loadCoins();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Moderation failed');
        } finally {
            submitting = false;
        }
    }

    onMount(() => { void loadCoins(''); });
</script>

<svelte:head>
    <title>Coin Management | Rugplay</title>
</svelte:head>

<div class="container mx-auto max-w-4xl space-y-6 py-6">
    <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">Coin Management</h1>
        <p class="text-sm text-muted-foreground">Take down or restore coins without deleting their trading history.</p>
    </div>

    <Card.Root>
        <Card.Header><Card.Title>Coins</Card.Title></Card.Header>
        <Card.Content class="space-y-4">
            <form class="flex gap-2" onsubmit={(event) => { event.preventDefault(); void loadCoins(); }}>
                <Input placeholder="Search by coin name or symbol..." bind:value={search} />
                <Button type="submit" disabled={loading}>Search</Button>
            </form>
            <p class="text-muted-foreground text-xs">Showing up to 50 matching coins, newest first.</p>
            {#if loading}
                <p class="text-sm text-muted-foreground">Loading...</p>
            {:else if coins.length === 0}
                <p class="text-sm text-muted-foreground">No coins found.</p>
            {:else}
                {#each coins as entry (entry.id)}
                    <div class="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div class="min-w-0 space-y-1">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="font-medium">{entry.name} (*{entry.symbol})</span>
                                <Badge variant={entry.isListed ? 'success' : 'destructive'}>
                                    {entry.isListed ? 'Listed' : 'Delisted'}
                                </Badge>
                            </div>
                            <p class="text-xs text-muted-foreground">
                                Creator: {entry.creatorUsername ? '@' + entry.creatorUsername : 'Unknown'}
                                Â· Market cap: ${Number(entry.marketCap).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            </p>
                            <p class="text-xs text-muted-foreground">
                                Price: ${Number(entry.currentPrice).toFixed(6)}
                                Â· 24h volume: ${Number(entry.volume24h ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            </p>
                        </div>
                        <div class="flex items-center gap-3">
                            <a href={`/coin/${entry.symbol}`} class="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">View coin</a>
                            <Button variant={entry.isListed ? 'destructive' : 'outline'} onclick={() => beginAction(entry)}>
                                {entry.isListed ? 'Take Down' : 'Restore'}
                            </Button>
                        </div>
                    </div>
                {/each}
            {/if}
        </Card.Content>
    </Card.Root>

    {#if pending}
        <Card.Root>
            <Card.Header>
                <Card.Title>
                    {pending.action === 'delist' ? 'Take Down' : 'Restore'} *{pending.coin.symbol}
                </Card.Title>
            </Card.Header>
            <Card.Content class="space-y-3">
                <p class="text-sm text-muted-foreground">
                    {pending.action === 'delist'
                        ? 'The coin will disappear from the market and trading will be disabled. Existing holdings and transaction history remain.'
                        : 'The coin will return to the market and trading will be enabled, subject to normal lock rules.'}
                </p>
                <label for="moderation-reason" class="text-sm font-medium">Moderation reason</label>
                <Textarea id="moderation-reason" placeholder="Explain why..." bind:value={reason} />
                <div class="flex gap-2">
                    <Button variant={pending.action === 'delist' ? 'destructive' : 'default'}
                        disabled={submitting || reason.trim().length < 3} onclick={applyAction}>
                        {submitting ? 'Applying...' : pending.action === 'delist' ? 'Confirm Takedown' : 'Confirm Restore'}
                    </Button>
                    <Button variant="outline" disabled={submitting} onclick={() => { pending = null; reason = ''; }}>
                        Cancel
                    </Button>
                </div>
            </Card.Content>
        </Card.Root>
    {/if}

    <Card.Root>
        <Card.Header><Card.Title>Moderation History</Card.Title></Card.Header>
        <Card.Content>
            {#if history.length === 0}
                <p class="text-sm text-muted-foreground">No moderation actions yet.</p>
            {:else}
                <div class="divide-y">
                    {#each history as entry (entry.id)}
                        <div class="space-y-1 py-3">
                            <div class="flex items-center justify-between gap-2 text-sm">
                                <span class="font-medium">{entry.coinName} (*{entry.coinSymbol})</span>
                                <span class={entry.action === 'delist' ? 'text-red-500' : 'text-green-500'}>
                                    {entry.action === 'delist' ? 'Taken down' : 'Restored'}
                                </span>
                            </div>
                            <p class="text-xs text-muted-foreground">By @{entry.adminUsername} Â· {new Date(entry.createdAt).toLocaleString()}</p>
                            <p class="text-sm text-muted-foreground">{entry.reason}</p>
                        </div>
                    {/each}
                </div>
            {/if}
        </Card.Content>
    </Card.Root>
</div>
