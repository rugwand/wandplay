<script lang="ts">
    import { onMount } from 'svelte';
    import * as Card from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Textarea } from '$lib/components/ui/textarea';
    import { toast } from 'svelte-sonner';

    type Announcement = { id: number; title: string; message: string; kind: string; link: string | null; scheduledAt: string; sentAt: string | null; cancelledAt: string | null; };
    let rows = $state<Announcement[]>([]);
    let title = $state('');
    let message = $state('');
    let kind = $state('announcement');
    let link = $state('');
    let schedule = $state('');
    let saving = $state(false);
    let loading = $state(true);

    async function refresh() {
        loading = true;
        try {
            const r = await fetch('/api/admin/announcements');
            if (!r.ok) throw new Error((await r.json()).message || 'Failed to load announcements');
            rows = (await r.json()).announcements;
        } catch(e) { toast.error(e instanceof Error ? e.message : 'Failed to load'); }
        finally { loading = false; }
    }
    async function create() {
        if (saving) return;
        const descriptor = schedule ? `scheduled for ${new Date(schedule).toLocaleString()}` : 'sent to all existing users now';
        if (!window.confirm(`This announcement will be ${descriptor}. Continue?`)) return;
        saving = true;
        try {
            const r = await fetch('/api/admin/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', title, message, kind, link, scheduledAt: schedule ? new Date(schedule).toISOString() : null }) });
            if (!r.ok) { const e = await r.json(); throw new Error(e.message || 'Creation failed'); }
            toast.success('Announcement created'); title = ''; message = ''; link = ''; schedule = '';
            await refresh();
        } catch(e) { toast.error(e instanceof Error ? e.message : 'Creation failed'); }
        finally { saving = false; }
    }
    async function cancel(id: number) {
        if (!window.confirm(`Cancel announcement #${id}?`)) return;
        try {
            const r = await fetch('/api/admin/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', id }) });
            if (!r.ok) { const e = await r.json(); throw new Error(e.message || 'Cancellation failed'); }
            toast.success('Cancelled'); await refresh();
        } catch(e) { toast.error(e instanceof Error ? e.message : 'Cancellation failed'); }
    }
    onMount(() => { void refresh(); });
</script>
<svelte:head><title>Announcement Manager | Wandplay</title></svelte:head>
<div class="container mx-auto max-w-4xl space-y-6 py-6">
    <div><h1 class="text-2xl font-semibold tracking-tight">Announcement Manager</h1><p class="text-sm text-muted-foreground">Send system notifications now or schedule delivery.</p></div>
    <Card.Root>
        <Card.Header><Card.Title>New Announcement</Card.Title></Card.Header>
        <Card.Content class="space-y-4">
            <div class="space-y-2"><label class="text-sm font-medium" for="atitle">Title</label><Input id="atitle" maxlength={200} bind:value={title} placeholder="Announcement title" /></div>
            <div class="space-y-2"><label class="text-sm font-medium" for="amsg">Message</label><Textarea id="amsg" bind:value={message} placeholder="Message for all users" /></div>
            <div class="space-y-2"><label class="text-sm font-medium" for="akind">Type</label><select id="akind" bind:value={kind} class="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="announcement">Announcement</option><option value="notice">Notice</option><option value="maintenance">Maintenance notice</option></select></div>
            <div class="space-y-2"><label class="text-sm font-medium" for="alink">Optional internal link</label><Input id="alink" bind:value={link} placeholder="/market" /></div>
            <div class="space-y-2"><label class="text-sm font-medium" for="adate">Schedule (optional)</label><Input id="adate" type="datetime-local" bind:value={schedule} /><p class="text-xs text-muted-foreground">Leave blank to send immediately. Scheduled messages are processed by Wandplay's background scheduler, usually within 5 minutes of the selected time.</p></div>
            <Button onclick={create} disabled={saving || !title.trim() || !message.trim()}>{saving ? 'Working...' : schedule ? 'Schedule Announcement' : 'Send to All Users'}</Button>
        </Card.Content>
    </Card.Root>
    <Card.Root>
        <Card.Header><Card.Title>Announcement History</Card.Title></Card.Header>
        <Card.Content class="space-y-2">
            {#if loading}<p class="text-sm text-muted-foreground">Loading...</p>
            {:else if !rows.length}<p class="text-sm text-muted-foreground">No announcements yet.</p>{/if}
            {#each rows as row (row.id)}
                <div class="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
                    <div class="min-w-0 flex-1"><p class="font-medium">{row.title}</p><p class="text-sm text-muted-foreground">{row.message}</p><p class="mt-2 text-xs text-muted-foreground">{row.kind} · {row.cancelledAt ? 'Cancelled' : row.sentAt ? 'Sent' : 'Scheduled'} · {new Date(row.scheduledAt).toLocaleString()}</p></div>
                    {#if !row.sentAt && !row.cancelledAt}<Button variant="outline" onclick={() => cancel(row.id)}>Cancel</Button>{/if}
                </div>
            {/each}
        </Card.Content>
    </Card.Root>
</div>
