<script lang="ts">
    import { onMount } from 'svelte';
    import * as Card from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { toast } from 'svelte-sonner';
    type Config = { maintenance: boolean; registrationsEnabled: boolean; coinCreationEnabled: boolean; maxCoinsPerUser: number; startingCash: string; startingGems: number; coinFeeMultiplier: string; };
    type Audit = { id: number; adminUsername: string; section: string; details: string; createdAt: string; };
    let settings = $state<Config | null>(null);
    let history = $state<Audit[]>([]);
    let reason = $state('Administrative settings update');
    let saving = $state(false);
    async function refresh() {
        try {
            const r = await fetch('/api/admin/global-control');
            if (!r.ok) throw new Error('Failed to load platform settings');
            const data = await r.json(); settings = data.settings; history = data.history;
        } catch(e) { toast.error(e instanceof Error ? e.message : 'Load failed'); }
    }
    async function save() {
        if (!settings || saving) return;
        if (!window.confirm('Apply these platform-wide settings? Changes can affect all users.')) return;
        saving = true;
        try {
            const r = await fetch('/api/admin/global-control', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...settings, reason }) });
            if (!r.ok) { const e = await r.json(); throw new Error(e.message || 'Failed to save'); }
            toast.success('Global settings saved'); await refresh();
        } catch(e) { toast.error(e instanceof Error ? e.message : 'Save failed'); }
        finally { saving = false; }
    }
    onMount(() => { void refresh(); });
</script>
<svelte:head><title>Global Settings | Rugplay</title></svelte:head>
<div class="container mx-auto max-w-4xl space-y-6 py-6">
    <div><h1 class="text-2xl font-semibold tracking-tight">Global Settings</h1><p class="text-sm text-muted-foreground">Configure platform access, new accounts and coin creation.</p></div>
    {#if settings}
        <Card.Root><Card.Header><Card.Title>Platform Access</Card.Title></Card.Header><Card.Content class="space-y-4">
            <label class="flex items-center gap-3"><input type="checkbox" bind:checked={settings.maintenance} /><span class="text-sm">Maintenance mode (admins only)</span></label>
            <label class="flex items-center gap-3"><input type="checkbox" bind:checked={settings.registrationsEnabled} /><span class="text-sm">Allow new registrations</span></label>
            <label class="flex items-center gap-3"><input type="checkbox" bind:checked={settings.coinCreationEnabled} /><span class="text-sm">Allow coin creation</span></label>
            <p class="text-xs text-muted-foreground">Maintenance blocks regular site and API access. Administrators can still log in. Existing arcade rounds may be interrupted by maintenance.</p>
        </Card.Content></Card.Root>
        <Card.Root><Card.Header><Card.Title>Starting Balances</Card.Title></Card.Header><Card.Content class="space-y-4">
            <div class="space-y-2"><label for="cash" class="text-sm font-medium">Starting cash ($)</label><Input id="cash" bind:value={settings.startingCash} /></div>
            <div class="space-y-2"><label for="gems" class="text-sm font-medium">Starting gems</label><Input id="gems" type="number" min={0} bind:value={settings.startingGems} /></div>
            <p class="text-xs text-muted-foreground">Applies to newly registered users only. Existing balances are not modified.</p>
        </Card.Content></Card.Root>
        <Card.Root><Card.Header><Card.Title>Coin Creation</Card.Title></Card.Header><Card.Content class="space-y-4">
            <div class="space-y-2"><label for="coinlimit" class="text-sm font-medium">Maximum coins created per user (0 = unlimited)</label><Input id="coinlimit" type="number" min={0} bind:value={settings.maxCoinsPerUser} /></div>
            <div class="space-y-2"><label for="feem" class="text-sm font-medium">Coin creation fee multiplier</label><Input id="feem" bind:value={settings.coinFeeMultiplier} /></div>
            <p class="text-xs text-muted-foreground">The multiplier changes future coin creation fees, not past fees or trading fees. Original game payouts remain unchanged.</p>
        </Card.Content></Card.Root>
        <Card.Root><Card.Header><Card.Title>Apply Changes</Card.Title></Card.Header><Card.Content class="space-y-3">
            <label for="reason" class="text-sm font-medium">Reason (saved in admin history)</label><Input id="reason" bind:value={reason} />
            <Button onclick={save} disabled={saving || reason.trim().length < 4}>{saving ? 'Saving...' : 'Save Global Settings'}</Button>
        </Card.Content></Card.Root>
        <Card.Root><Card.Header><Card.Title>Recent Admin Changes</Card.Title></Card.Header><Card.Content class="space-y-3">
            {#each history as a (a.id)}<div class="border-b pb-2 text-sm"><strong>@{a.adminUsername}</strong> · {a.section} · {new Date(a.createdAt).toLocaleString()}<p class="break-all text-xs text-muted-foreground">{a.details}</p></div>{/each}
            {#if !history.length}<p class="text-sm text-muted-foreground">No changes recorded.</p>{/if}
        </Card.Content></Card.Root>
    {:else}<p class="text-sm text-muted-foreground">Loading settings...</p>{/if}
</div>
