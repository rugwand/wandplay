<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import * as Card from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Textarea } from '$lib/components/ui/textarea';
    import { toast } from 'svelte-sonner';

    type Report = { id: number; targetType: string; targetLabel: string; status: string; createdAt: string };
    let targetType = $state<'USER'|'COIN'|'COMMENT'>('USER');
    let target = $state('');
    let reason = $state('');
    let reports = $state<Report[]>([]);
    let sending = $state(false);

    async function load() {
        const res = await fetch('/api/reports');
        if (res.ok) reports = (await res.json()).reports ?? [];
    }
    onMount(() => {
        const initialType = page.url.searchParams.get('type')?.toUpperCase();
        if (initialType === 'USER' || initialType === 'COIN' || initialType === 'COMMENT') targetType = initialType;
        target = page.url.searchParams.get('target') ?? '';
        load();
    });
    async function submit() {
        if (sending) return;
        sending = true;
        try {
            const res = await fetch('/api/reports', { method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ targetType, target, reason }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || data.error || 'Report failed');
            toast.success('Report submitted for review'); target = ''; reason = ''; await load();
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Report failed'); }
        finally { sending = false; }
    }
</script>
<svelte:head><title>Report Content | Wandplay</title></svelte:head>
<div class="container mx-auto max-w-4xl space-y-6 py-6">
    <div><h1 class="text-2xl font-semibold tracking-tight">Report Content</h1><p class="text-sm text-muted-foreground">Report players, coins or comments for moderator review.</p></div>
    <Card.Root>
        <Card.Header><Card.Title>Submit a Report</Card.Title></Card.Header>
        <Card.Content class="space-y-4">
            <div class="space-y-2"><label for="report-type" class="text-sm font-medium">Report type</label>
                <select id="report-type" bind:value={targetType} class="flex h-10 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="USER">Player</option><option value="COIN">Coin</option><option value="COMMENT">Comment</option>
                </select>
            </div>
            <div class="space-y-2"><label for="report-target" class="text-sm font-medium">{targetType === 'USER' ? 'Player username' : targetType === 'COIN' ? 'Coin name or symbol' : 'Comment ID'}</label>
                <Input id="report-target" bind:value={target} placeholder={targetType === 'USER' ? 'fergie' : targetType === 'COIN' ? 'TEST' : '123'}/>
            </div>
            <div class="space-y-2"><label for="report-reason" class="text-sm font-medium">Reason (10 to 2000 characters)</label>
                <Textarea id="report-reason" bind:value={reason} placeholder="Describe what happened and why it should be reviewed..."/>
            </div>
            <Button onclick={submit} disabled={sending || !target.trim() || reason.trim().length < 10}>{sending ? 'Submitting...' : 'Submit Report'}</Button>
            <p class="text-xs text-muted-foreground">You can submit up to five reports in 24 hours. False or abusive reports may be moderated.</p>
        </Card.Content>
    </Card.Root>
    <Card.Root>
        <Card.Header><Card.Title>My Reports</Card.Title></Card.Header>
        <Card.Content>
            {#if reports.length === 0}<p class="text-sm text-muted-foreground">No reports submitted.</p>
            {:else}<div class="divide-y">{#each reports as item (item.id)}
                <div class="flex items-center justify-between gap-3 py-3 text-sm">
                    <div><strong>#{item.id}</strong> {item.targetType} · {item.targetLabel}<p class="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p></div>
                    <span class="text-xs text-muted-foreground">{item.status}</span>
                </div>
            {/each}</div>{/if}
        </Card.Content>
    </Card.Root>
</div>
