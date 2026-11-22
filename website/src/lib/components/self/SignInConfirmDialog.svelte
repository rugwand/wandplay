<script lang="ts">
    import {
        Dialog,
        DialogContent,
        DialogHeader,
        DialogTitle,
        DialogDescription
    } from '$lib/components/ui/dialog';
    import { Button } from '$lib/components/ui/button';
    import { Input } from '$lib/components/ui/input';
    import { signIn, signUp } from '$lib/auth-client';
    import { page } from '$app/state';
    import { toast } from 'svelte-sonner';

    // Form adapted from lordpipon/catplay (CC BY-NC 4.0), using Wandplay components.
    let { open = $bindable(false) } = $props<{ open?: boolean }>();
    let mode = $state<'signin' | 'signup'>('signin');
    let email = $state('');
    let password = $state('');
    let confirmPassword = $state('');
    let showPassword = $state(false);
    let loading = $state(false);

    function returnPath() {
        return `${page.url.pathname}?signIn=1`;
    }

    async function onGoogle() {
        if (loading) return;
        loading = true;
        try {
            const res = await signIn.social({
                provider: 'google',
                callbackURL: returnPath()
            });
            if (res.error) toast.error(res.error.message || 'Google sign-in failed');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Google sign-in failed');
        } finally {
            loading = false;
        }
    }

    async function onEmailSubmit(event: SubmitEvent) {
        event.preventDefault();
        if (loading) return;

        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !password) {
            toast.error('Enter your email and password');
            return;
        }
        if (mode === 'signup' && password.length < 8) {
            toast.error('Use at least 8 characters for your password');
            return;
        }
        if (mode === 'signup' && password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        loading = true;
        try {
            if (mode === 'signup') {
                const res = await signUp.email({
                    email: cleanEmail,
                    password,
                    name: cleanEmail.split('@')[0] || 'Player',
                    callbackURL: returnPath()
                });
                if (res.error) throw new Error(res.error.message || 'Could not create account');
                toast.success('Account created');
            } else {
                const res = await signIn.email({
                    email: cleanEmail,
                    password,
                    callbackURL: returnPath()
                });
                if (res.error) throw new Error(res.error.message || 'Invalid email or password');
            }
            password = '';
            confirmPassword = '';
            open = false;
            window.location.reload();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Authentication failed');
        } finally {
            loading = false;
        }
    }
</script>

<Dialog bind:open>
    <DialogContent class="sm:max-w-md">
        <DialogHeader>
            <DialogTitle>Sign in to Wandplay</DialogTitle>
            <DialogDescription>
                Sign in with your email and password, or continue with Google.
                Create an account if you are new here.
            </DialogDescription>
        </DialogHeader>

        <div class="flex flex-col gap-4 py-2">
            <form class="flex flex-col gap-3" onsubmit={onEmailSubmit}>
                <div class="grid grid-cols-2 gap-2">
                    <Button
                        type="button"
                        variant={mode === 'signin' ? 'default' : 'outline'}
                        disabled={loading}
                        onclick={() => { mode = 'signin'; confirmPassword = ''; }}
                    >Sign In</Button>
                    <Button
                        type="button"
                        variant={mode === 'signup' ? 'default' : 'outline'}
                        disabled={loading}
                        onclick={() => { mode = 'signup'; confirmPassword = ''; }}
                    >Create Account</Button>
                </div>

                <Input
                    type="email"
                    placeholder="you@example.com"
                    autocomplete="email"
                    bind:value={email}
                    required
                    disabled={loading}
                />
                <div class="relative">
                    <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder={mode === 'signup' ? 'Password (at least 8 characters)' : 'Password'}
                        autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        bind:value={password}
                        minlength={mode === 'signup' ? 8 : undefined}
                        class="pr-16"
                        required
                        disabled={loading}
                    />
                    <button
                        type="button"
                        class="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                        onclick={() => (showPassword = !showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >{showPassword ? 'Hide' : 'Show'}</button>
                </div>

                {#if mode === 'signup'}
                    <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Confirm password"
                        autocomplete="new-password"
                        bind:value={confirmPassword}
                        minlength={8}
                        required
                        disabled={loading}
                    />
                    <p class="text-muted-foreground text-xs">
                        Your username is generated automatically. You can change it later in Settings.
                    </p>
                {/if}

                <Button
                    type="submit"
                    variant="default"
                    class="w-full"
                    disabled={loading || (mode === 'signup' && password !== confirmPassword)}
                >{loading ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Sign In'}</Button>
            </form>

            <div class="flex items-center gap-3">
                <div class="bg-border h-px flex-1"></div>
                <span class="text-muted-foreground text-xs">or</span>
                <div class="bg-border h-px flex-1"></div>
            </div>

            <Button
                class="flex w-full items-center justify-center gap-2"
                variant="default"
                disabled={loading}
                onclick={onGoogle}
            >
                <img
                    class="h-5 w-5"
                    src="https://lh3.googleusercontent.com/COxitqgJr1sJnIDe8-jiKhxDx1FrYbtRHKJ9z_hELisAlapwE9LUPh6fcXIfb5vwpbMl4xl9H9TRFPc5NOO8Sb3VSgIBrfRYvW6cUA"
                    alt="Google"
                />
                Continue with Google
            </Button>

            <p class="text-muted-foreground text-center text-xs">
                By continuing, you agree to our
                <a href="/legal/terms" class="text-primary hover:underline">Terms of Service</a>
                and
                <a href="/legal/privacy" class="text-primary hover:underline">Privacy Policy</a>
            </p>
        </div>
    </DialogContent>
</Dialog>