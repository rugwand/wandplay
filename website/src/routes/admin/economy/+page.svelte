
<script lang="ts">
    import { onMount } from 'svelte';
    import * as Card from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { Textarea } from '$lib/components/ui/textarea';
    import { toast } from 'svelte-sonner';

    interface User {
        id: number;
        username: string;
        name: string;
        cash: string;
        gems: number;
    }

    interface Adjustment {
        id: number;
        adminUsername: string;
        targetUsername: string;
        currency: string;
        operation: string;
        amount: string;
        previousBalance: string;
        newBalance: string;
        reason: string;
        createdAt: string;
    }

    let search = $state('');
    let users = $state<User[]>([]);
    let selected = $state<User | null>(null);
    let history = $state<Adjustment[]>([]);

    let currency = $state<'cash' | 'gems'>('cash');
    let operation = $state<'add' | 'remove' | 'set'>('add');
    let amount = $state('');
    let reason = $state('');

    let loading = $state(false);
    let submitting = $state(false);

    function formatBalance(value: string | number, type: string) {
        const number = Number(value);

        if (type === 'gems') {
            return number.toLocaleString('en-US') + ' gems';
        }

        return '$' + number.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 8
        });
    }

    async function loadData(query = search) {
        loading = true;

        try {
            const response = await fetch(
                `/api/admin/economy?q=${encodeURIComponent(query.trim())}`
            );

            if (!response.ok) {
                throw new Error('Failed to load economy data');
            }

            const data = await response.json();

            users = data.users;
            history = data.history;

            if (selected) {
                selected = users.find(
                    (u: User) => u.id === selected?.id
                ) ?? selected;
            }
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : 'Request failed'
            );
        } finally {
            loading = false;
        }
    }

    function selectUser(user: User) {
        selected = user;
        amount = '';
        reason = '';
        operation = 'add';
        currency = 'cash';
    }

    async function applyAdjustment() {
        if (!selected || submitting) return;

        if (!amount.trim() || !reason.trim()) {
            toast.error('Amount and reason are required');
            return;
        }

        const confirmed = window.confirm(
            `${operation.toUpperCase()} ${formatBalance(amount, currency)}\n` +
            `User: @${selected.username}\n` +
            `Reason: ${reason}\n\n` +
            `Confirm this administrative adjustment?`
        );

        if (!confirmed) return;

        submitting = true;

        try {
            const response = await fetch('/api/admin/economy', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    targetUserId: selected.id,
                    currency,
                    operation,
                    amount: amount.trim(),
                    reason: reason.trim()
                })
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    result.message || result.error || 'Adjustment failed'
                );
            }

            toast.success('Balance updated successfully');

            amount = '';
            reason = '';

            await loadData(selected.username);

        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : 'Adjustment failed'
            );
        } finally {
            submitting = false;
        }
    }

    onMount(() => {
        loadData('');
    });
</script>

<svelte:head>
    <title>Economy Management | Rugplay</title>
</svelte:head>

<div class="container mx-auto max-w-4xl space-y-6 py-6">

    <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">
            Economy Management
        </h1>
        <p class="text-sm text-muted-foreground">
            Manage user balances and review administrative adjustments.
        </p>
    </div>

    <Card.Root>
        <Card.Header>
            <Card.Title>User Search</Card.Title>
        </Card.Header>

        <Card.Content class="space-y-4">
            <div class="flex gap-2">
                <Input
                    placeholder="Search by username..."
                    bind:value={search}
                />

                <Button onclick={() => loadData()} disabled={loading}>
                    Search
                </Button>
            </div>

            {#if loading}
                <p class="text-sm text-muted-foreground">
                    Loading...
                </p>
            {:else if search.trim() && users.length === 0}
                <p class="text-sm text-muted-foreground">
                    No matching users found.
                </p>
            {/if}

            {#each users as account (account.id)}
                <div class="flex items-center justify-between rounded-md border p-3">
                    <div>
                        <p class="font-medium">@{account.username}</p>
                        <p class="text-sm text-muted-foreground">
                            {formatBalance(account.cash, 'cash')}
                            · {account.gems} gems
                        </p>
                    </div>

                    <Button
                        variant="outline"
                        onclick={() => selectUser(account)}
                    >
                        Select
                    </Button>
                </div>
            {/each}
        </Card.Content>
    </Card.Root>

    {#if selected}
        <Card.Root>
            <Card.Header>
                <Card.Title>
                    Manage @{selected.username}
                </Card.Title>
            </Card.Header>

            <Card.Content class="space-y-5">

                <div class="grid grid-cols-2 gap-4">
                    <div class="rounded-md border p-4">
                        <p class="text-sm text-muted-foreground">
                            Cash Balance
                        </p>
                        <p class="mt-1 text-xl font-semibold">
                            {formatBalance(selected.cash, 'cash')}
                        </p>
                    </div>

                    <div class="rounded-md border p-4">
                        <p class="text-sm text-muted-foreground">
                            Gems Balance
                        </p>
                        <p class="mt-1 text-xl font-semibold">
                            {selected.gems.toLocaleString()}
                        </p>
                    </div>
                </div>

                <div class="space-y-2">
                    <label for="currency" class="text-sm font-medium">
                        Currency
                    </label>

                    <select
                        id="currency"
                        bind:value={currency}
                        class="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                        <option value="cash">Cash ($)</option>
                        <option value="gems">Gems</option>
                    </select>
                </div>

                <div class="space-y-2">
                    <label for="operation" class="text-sm font-medium">
                        Operation
                    </label>

                    <select
                        id="operation"
                        bind:value={operation}
                        class="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                        <option value="add">Add balance</option>
                        <option value="remove">Remove balance</option>
                        <option value="set">Set exact balance</option>
                    </select>
                </div>

                <div class="space-y-2">
                    <label for="amount" class="text-sm font-medium">
                        Amount
                    </label>

                    <Input
                        id="amount"
                        type="text"
                        inputmode="decimal"
                        placeholder={currency === 'cash' ? '1000.00' : '100'}
                        bind:value={amount}
                    />
                </div>

                <div class="space-y-2">
                    <label for="reason" class="text-sm font-medium">
                        Reason
                    </label>

                    <Textarea
                        id="reason"
                        placeholder="Reason for this adjustment..."
                        bind:value={reason}
                    />
                </div>

                <Button
                    onclick={applyAdjustment}
                    disabled={submitting || !amount.trim() || !reason.trim()}
                >
                    {submitting ? 'Applying...' : 'Apply Adjustment'}
                </Button>

            </Card.Content>
        </Card.Root>
    {/if}

    <Card.Root>
        <Card.Header>
            <Card.Title>Adjustment History</Card.Title>
        </Card.Header>

        <Card.Content>
            {#if history.length === 0}
                <p class="text-sm text-muted-foreground">
                    No administrative adjustments yet.
                </p>
            {:else}
                <div class="divide-y">
                    {#each history as entry (entry.id)}
                        <div class="space-y-1 py-3">
                            <div class="flex items-center justify-between gap-3">
                                <p class="text-sm font-medium">
                                    @{entry.targetUsername}
                                </p>
                                <span class="text-sm font-medium">
                                    {entry.operation.toUpperCase()}
                                    {formatBalance(entry.amount, entry.currency)}
                                </span>
                            </div>

                            <p class="text-xs text-muted-foreground">
                                By @{entry.adminUsername}
                                · {new Date(entry.createdAt).toLocaleString()}
                            </p>

                            <p class="text-sm text-muted-foreground">
                                {entry.reason}
                            </p>

                            <p class="text-xs text-muted-foreground">
                                {formatBalance(entry.previousBalance, entry.currency)}
                                →
                                {formatBalance(entry.newBalance, entry.currency)}
                            </p>
                        </div>
                    {/each}
                </div>
            {/if}
        </Card.Content>
    </Card.Root>

</div>
