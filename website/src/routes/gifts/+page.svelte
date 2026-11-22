<script lang="ts">
    import { onMount } from 'svelte';
    import * as Card from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { toast } from 'svelte-sonner';
    import { NAME_COLOR_CATALOG } from '$lib/data/shop-catalog';
    import { fetchGemsBalance } from '$lib/stores/gems';

    type Gift = { id: number; senderUsername: string; recipientUsername: string; kind: string; gemsAmount: number | null; colorKey: string | null; createdAt: string };
    let recipientUsername = $state('');
    let kind = $state<'GEMS' | 'COLOR'>('GEMS');
    let amount = $state('');
    let colorKey = $state('');
    let ownedColors = $state<string[]>([]);
    let gems = $state(0);
    let history = $state<Gift[]>([]);
    let loading = $state(false);

    const availableColors = $derived(NAME_COLOR_CATALOG.filter((item) => ownedColors.includes(item.key)));

    async function load() {
        try {
            const [inventoryRes, giftsRes] = await Promise.all([fetch('/api/shop/inventory'), fetch('/api/gifts')]);
            if (!inventoryRes.ok || !giftsRes.ok) throw new Error('Sign in to view gifting');
            const inventory = await inventoryRes.json();
            const giftData = await giftsRes.json();
            gems = inventory.gems ?? 0;
            ownedColors = inventory.nameColors ?? [];
            history = giftData.history ?? [];
            if (colorKey && !ownedColors.includes(colorKey)) colorKey = '';
            await fetchGemsBalance();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to load gifts');
        }
    }

    async function sendGift() {
        if (loading || !recipientUsername.trim()) return;
        const label = kind === 'GEMS' ? `${amount} gems` : NAME_COLOR_CATALOG.find((c) => c.key === colorKey)?.label;
        if (!label) { toast.error('Choose a gift'); return; }
        if (!confirm(`Send ${label} to @${recipientUsername.trim()}? This cannot be undone.`)) return;
        loading = true;
        try {
            const res = await fetch('/api/gifts', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipientUsername: recipientUsername.trim(), kind, amount: Number(amount), colorKey })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || data.error || 'Gift failed');
            toast.success(`Gift sent to @${data.recipient}`);
            amount = ''; colorKey = '';
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Gift failed');
        } finally { loading = false; }
    }
    onMount(load);
</script>
<svelte:head><title>Gifting | Wandplay</title></svelte:head>
<div class="container mx-auto max-w-4xl space-y-6 py-6">
    <div><h1 class="text-2xl font-semibold tracking-tight">Gifting</h1><p class="text-sm text-muted-foreground">Send gems or owned name colors to other players.</p></div>
    <Card.Root>
        <Card.Header><Card.Title>Send a Gift</Card.Title></Card.Header>
        <Card.Content class="space-y-4">
            <div class="space-y-2"><label for="gift-user" class="text-sm font-medium">Recipient username</label><Input id="gift-user" placeholder="fergie" bind:value={recipientUsername}/></div>
            <div class="space-y-2"><label for="gift-type" class="text-sm font-medium">Gift type</label>
                <select id="gift-type" bind:value={kind} class="flex h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="GEMS">Gems</option><option value="COLOR">Owned name color</option></select>
            </div>
            {#if kind === 'GEMS'}
                <p class="text-sm text-muted-foreground">Available: {gems.toLocaleString()} gems</p>
                <div class="space-y-2"><label for="gem-amount" class="text-sm font-medium">Gems to send</label><Input id="gem-amount" type="number" min="1" max="100000" step="1" placeholder="100" bind:value={amount}/></div>
            {:else}
                <div class="space-y-2"><label for="gift-color" class="text-sm font-medium">Owned color</label>
                    <select id="gift-color" bind:value={colorKey} class="flex h-10 w-full rounded-md border bg-background px-3 text-sm">
                        <option value="">Select a color...</option>
                        {#each availableColors as item (item.key)}<option value={item.key}>{item.label}</option>{/each}
                    </select>
                </div>
                <p class="text-xs text-muted-foreground">Gifting a color transfers ownership. If you have it equipped, it will be unequipped. A recipient cannot receive a color they already own.</p>
            {/if}
            <Button onclick={sendGift} disabled={loading || !recipientUsername.trim() || (kind === 'GEMS' ? !amount : !colorKey)}>{loading ? 'Sending...' : 'Send Gift'}</Button>
            <p class="text-xs text-muted-foreground">Limit: 20 gifts per 24 hours. No gifting to yourself, blocked users or players in an active ranked season.</p>
        </Card.Content>
    </Card.Root>
    <Card.Root>
        <Card.Header><Card.Title>Recent Gifts</Card.Title></Card.Header>
        <Card.Content>
            {#if history.length === 0}<p class="text-sm text-muted-foreground">No gifts yet.</p>
            {:else}<div class="divide-y">
                {#each history as item (item.id)}
                    <div class="py-3 text-sm">
                        <p><strong>@{item.senderUsername}</strong> to <strong>@{item.recipientUsername}</strong>: {item.kind === 'GEMS' ? `${item.gemsAmount} gems` : NAME_COLOR_CATALOG.find((c) => c.key === item.colorKey)?.label || item.colorKey}</p>
                        <p class="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                {/each}
            </div>{/if}
        </Card.Content>
    </Card.Root>
</div>
