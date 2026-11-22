<script lang="ts">
    import { onMount } from 'svelte';
    import * as Card from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { toast } from 'svelte-sonner';
    type Game = { game: string; enabled: boolean; minBet: string; maxBet: string };
    type Totals = { players: number; gamesPlayed: string; wagered: string; playerWinnings: string; playerLosses: string };
    let games = $state<Game[]>([]);
    let totals = $state<Totals | null>(null);
    let reason = $state('Administrative configuration');
    let busy = $state('');
    const names: Record<string,string> = { coinflip: 'Coinflip', slots: 'Slots', mines: 'Mines', dice: 'Dice', tower: 'Tower', blackjack: 'Blackjack' };
    async function refresh() {
        try {
            const r = await fetch('/api/admin/arcade-control');
            if (!r.ok) throw new Error('Failed to load arcade controls');
            const data = await r.json(); games = data.games; totals = data.totals;
        } catch(e) { toast.error(e instanceof Error ? e.message : 'Load failed'); }
    }
    async function save(row: Game) {
        if (!window.confirm(`Save settings for ${names[row.game]}?`)) return;
        busy = row.game;
        try {
            const r = await fetch('/api/admin/arcade-control', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...row, reason }) });
            if (!r.ok) { const e = await r.json(); throw new Error(e.message || 'Save failed'); }
            toast.success(`${names[row.game]} updated`); await refresh();
        } catch(e) { toast.error(e instanceof Error ? e.message : 'Save failed'); }
        finally { busy = ''; }
    }
    onMount(() => { void refresh(); });
</script>
<svelte:head><title>Arcade Management | Wandplay</title></svelte:head>
<div class="container mx-auto max-w-4xl space-y-6 py-6">
    <div><h1 class="text-2xl font-semibold tracking-tight">Arcade Management</h1><p class="text-sm text-muted-foreground">Manage game availability and server-enforced wager limits.</p></div>
    <Card.Root><Card.Header><Card.Title>Platform Wagering Totals</Card.Title></Card.Header><Card.Content>
        {#if totals}
            <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div><p class="text-xs text-muted-foreground">Games played</p><p class="font-semibold">{Number(totals.gamesPlayed).toLocaleString()}</p></div>
                <div><p class="text-xs text-muted-foreground">Total wagered</p><p class="font-semibold">${Number(totals.wagered).toLocaleString()}</p></div>
                <div><p class="text-xs text-muted-foreground">Player winnings</p><p class="font-semibold">${Number(totals.playerWinnings).toLocaleString()}</p></div>
                <div><p class="text-xs text-muted-foreground">Player losses</p><p class="font-semibold">${Number(totals.playerLosses).toLocaleString()}</p></div>
            </div>
        {/if}
        <p class="mt-3 text-xs text-muted-foreground">Lifetime aggregate statistics from user accounts. Per-game historical totals are not tracked by this version of Wandplay.</p>
    </Card.Content></Card.Root>
    <Card.Root><Card.Header><Card.Title>Game Controls</Card.Title></Card.Header><Card.Content class="space-y-4">
        <div class="space-y-2"><label for="arcade-reason" class="text-sm font-medium">Reason for changes</label><Input id="arcade-reason" bind:value={reason} /></div>
        {#each games as g (g.game)}
            <div class="space-y-3 rounded-md border p-4">
                <div class="flex flex-wrap items-center justify-between gap-3"><strong>{names[g.game]}</strong><label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={g.enabled} /> Enabled</label></div>
                <div class="grid grid-cols-2 gap-3"><div class="space-y-1"><label for={`min-${g.game}`} class="text-xs text-muted-foreground">Minimum bet ($)</label><Input id={`min-${g.game}`} bind:value={g.minBet} /></div><div class="space-y-1"><label for={`max-${g.game}`} class="text-xs text-muted-foreground">Maximum bet ($)</label><Input id={`max-${g.game}`} bind:value={g.maxBet} /></div></div>
                <Button onclick={() => save(g)} disabled={busy !== ''}>{busy === g.game ? 'Saving...' : 'Save Game Settings'}</Button>
            </div>
        {/each}
        <p class="text-xs text-muted-foreground">Disabling a game blocks new wagers, while existing Blackjack/Mines/Tower rounds may finish. Original game-specific maximums and payout rules still apply.</p>
    </Card.Content></Card.Root>
</div>
