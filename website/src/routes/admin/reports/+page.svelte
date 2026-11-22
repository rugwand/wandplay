<script lang="ts">
    import { onMount } from 'svelte';
    import * as Card from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { toast } from 'svelte-sonner';

    interface Report {
        id: number; reporterUsername: string; targetType: string; targetId: number; targetLabel: string;
        reason: string; status: string; createdAt: string; reviewedByUsername: string | null;
        reviewNote: string | null;
    }
    let reports = $state<Report[]>([]);
    let onlyOpen = $state(true);
    let note = $state<Record<number,string>>({});
    let busy = $state<number | null>(null);
    const shown = $derived(onlyOpen ? reports.filter((r) => r.status === 'OPEN') : reports);

    async function load() {
        try {
            const res = await fetch('/api/admin/reports');
            if (!res.ok) throw new Error('Admin access required');
            reports = (await res.json()).reports ?? [];
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Cannot load reports'); }
    }
    async function review(id: number, status: 'RESOLVED' | 'DISMISSED') {
        if (busy !== null) return;
        if (!confirm(`Mark report #${id} ${status.toLowerCase()}?`)) return;
        busy = id;
        try {
            const res = await fetch('/api/admin/reports', { method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportId: id, status, note: note[id] || '' }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || data.error || 'Moderation failed');
            toast.success('Report updated'); await load();
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Moderation failed'); }
        finally { busy = null; }
    }
    onMount(load);
</script>
<svelte:head><title>Player Reports | Wandplay</title></svelte:head>
<div class="container mx-auto max-w-4xl space-y-6 py-6">
    <div><h1 class="text-2xl font-semibold tracking-tight">Player Reports</h1><p class="text-sm text-muted-foreground">Review player, coin and comment reports. Reports do not automatically remove content.</p></div>
    <Card.Root>
        <Card.Header><Card.Title>Moderation Queue</Card.Title></Card.Header>
        <Card.Content class="space-y-4">
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={onlyOpen}/> Show open reports only</label>
            {#if shown.length === 0}<p class="text-sm text-muted-foreground">No reports to show.</p>{/if}
            {#each shown as item (item.id)}
                <div class="space-y-3 rounded-md border p-4">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <strong class="text-sm">Report #{item.id} · {item.targetType}: {item.targetLabel}</strong>
                        <span class="text-xs text-muted-foreground">{item.status}</span>
                    </div>
                    <p class="text-xs text-muted-foreground">Reported by @{item.reporterUsername} · {new Date(item.createdAt).toLocaleString()}</p>
                    <p class="whitespace-pre-wrap break-words text-sm">{item.reason}</p>
                    {#if item.status === 'OPEN'}
                        <Input placeholder="Optional private moderator note" value={note[item.id] || ''} oninput={(e) => note[item.id] = e.currentTarget.value} />
                        <div class="flex flex-wrap gap-2">
                            <Button disabled={busy !== null} onclick={() => review(item.id, 'RESOLVED')}>Mark Resolved</Button>
                            <Button variant="outline" disabled={busy !== null} onclick={() => review(item.id, 'DISMISSED')}>Dismiss</Button>
                        </div>
                    {:else}
                        <p class="text-xs text-muted-foreground">Reviewed by @{item.reviewedByUsername ?? 'unknown'} · {item.reviewNote ?? 'No note'}</p>
                    {/if}
                </div>
            {/each}
        </Card.Content>
    </Card.Root>
</div>
