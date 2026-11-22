<script lang="ts">
    import { onMount } from 'svelte';
    import * as Card from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { client } from '$lib/auth-client';
    import { toast } from 'svelte-sonner';

    type SessionInfo = { id: number | string; createdAt: string | Date; userAgent?: string | null; ipAddress?: string | null };
    let sessions = $state<SessionInfo[]>([]);
    let currentPassword = $state('');
    let newPassword = $state('');
    let confirmPassword = $state('');
    let updating = $state(false);
    let revoking = $state(false);

    async function loadSessions() {
        try {
            const result = await client.listSessions();
            if (result.error) throw new Error(result.error.message || 'Could not load sessions');
            sessions = (result.data ?? []) as SessionInfo[];
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not load sessions'); }
    }
    async function changePassword() {
        if (updating) return;
        if (newPassword.length < 12) { toast.error('Use at least 12 characters'); return; }
        if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
        updating = true;
        try {
            const res = await client.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
            if (res.error) throw new Error(res.error.message || 'Password change failed');
            currentPassword = ''; newPassword = ''; confirmPassword = '';
            toast.success('Password changed. Other sessions were revoked.');
            await loadSessions();
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Password change failed'); }
        finally { updating = false; }
    }
    async function revokeOthers() {
        if (revoking || !confirm('Sign out all other devices?')) return;
        revoking = true;
        try {
            const res = await client.revokeOtherSessions();
            if (res.error) throw new Error(res.error.message || 'Could not revoke sessions');
            toast.success('Other sessions revoked'); await loadSessions();
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not revoke sessions'); }
        finally { revoking = false; }
    }
    onMount(loadSessions);
</script>
<svelte:head><title>Account Security | Wandplay</title></svelte:head>
<div class="container mx-auto max-w-4xl space-y-6 py-6">
    <div><h1 class="text-2xl font-semibold tracking-tight">Account Security</h1><p class="text-sm text-muted-foreground">Manage your password and signed-in devices.</p></div>
    <Card.Root>
        <Card.Header><Card.Title>Change Password</Card.Title></Card.Header>
        <Card.Content class="space-y-4">
            <p class="text-sm text-muted-foreground">Available for email/password accounts. Accounts that sign in only through Google don't have an existing password to change.</p>
            <div class="space-y-2"><label for="security-current" class="text-sm font-medium">Current password</label><Input id="security-current" type="password" autocomplete="current-password" bind:value={currentPassword}/></div>
            <div class="space-y-2"><label for="security-new" class="text-sm font-medium">New password (12 or more characters)</label><Input id="security-new" type="password" autocomplete="new-password" bind:value={newPassword}/></div>
            <div class="space-y-2"><label for="security-confirm" class="text-sm font-medium">Confirm new password</label><Input id="security-confirm" type="password" autocomplete="new-password" bind:value={confirmPassword}/></div>
            <Button disabled={updating || !currentPassword || newPassword.length < 12 || newPassword !== confirmPassword} onclick={changePassword}>{updating ? 'Updating...' : 'Change Password'}</Button>
            <p class="text-xs text-muted-foreground">Changing your password also signs out other devices. Password recovery by email requires configuring a mail provider separately.</p>
        </Card.Content>
    </Card.Root>
    <Card.Root>
        <Card.Header><Card.Title>Sessions & Devices</Card.Title></Card.Header>
        <Card.Content class="space-y-4">
            <div class="flex flex-wrap gap-2"><Button variant="outline" onclick={loadSessions}>Refresh Sessions</Button><Button onclick={revokeOthers} disabled={revoking}>{revoking ? 'Revoking...' : 'Sign Out Other Devices'}</Button></div>
            {#if sessions.length === 0}<p class="text-sm text-muted-foreground">No sessions available. You may need to sign in again.</p>{/if}
            <div class="divide-y">
                {#each sessions as item (item.id)}
                    <div class="py-3 text-sm"><p class="font-medium break-words">{item.userAgent || 'Unknown device'}</p><p class="text-xs text-muted-foreground">{item.ipAddress || 'IP not available'} · Signed in {new Date(item.createdAt).toLocaleString()}</p></div>
                {/each}
            </div>
            <p class="text-xs text-muted-foreground">Previously issued session cookies can stay valid briefly while session caching expires.</p>
        </Card.Content>
    </Card.Root>
</div>
