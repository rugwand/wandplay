
<script lang="ts">
    import { goto } from '$app/navigation';
    import * as Card from '$lib/components/ui/card';
    import { Button } from '$lib/components/ui/button';

    function navigate(path: string) {
        goto(path);
    }
</script>

<svelte:head>
    <title>Admin Panel | Rugplay</title>
</svelte:head>

<div class="container mx-auto max-w-4xl space-y-6 py-6">
    <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">
            Admin Panel
        </h1>
        <p class="text-sm text-muted-foreground">
            Manage and configure your Rugplay platform.
        </p>
    </div>

    <div class="grid gap-4 md:grid-cols-2">

        <Card.Root>
            <Card.Header>
                <Card.Title>User Management</Card.Title>
            </Card.Header>
            <Card.Content class="space-y-3">
                <p class="text-sm text-muted-foreground">
                    Manage users, review banned accounts and handle moderation.
                </p>
                <Button onclick={() => navigate('/admin/users')}>
                    Open User Management
                </Button>
            </Card.Content>
        </Card.Root>

        <Card.Root>
            <Card.Header>
                <Card.Title>Promo Codes</Card.Title>
            </Card.Header>
            <Card.Content class="space-y-3">
                <p class="text-sm text-muted-foreground">
                    Create and manage promotional codes for your platform.
                </p>
                <Button onclick={() => navigate('/admin/promo')}>
                    Manage Promo Codes
                </Button>
            </Card.Content>
        </Card.Root>

        <Card.Root>
            <Card.Header>
                <Card.Title>Season Settings</Card.Title>
            </Card.Header>
            <Card.Content class="space-y-3">
                <p class="text-sm text-muted-foreground">
                    Configure and manage platform seasons.
                </p>
                <Button onclick={() => navigate('/admin/seasons')}>
                    Manage Seasons
                </Button>
            </Card.Content>
        </Card.Root>

<Card.Root>
    <Card.Header>
        <Card.Title>Economy Management</Card.Title>
    </Card.Header>
    <Card.Content class="space-y-3">
        <p class="text-sm text-muted-foreground">
            Manage user balances, grant cash and gems,
            and review administrative adjustments.
        </p>
        <Button onclick={() => navigate('/admin/economy')}>
            Open Economy Management
        </Button>
    </Card.Content>
</Card.Root>

    </div>
</div>
