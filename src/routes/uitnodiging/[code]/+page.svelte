<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	// De layout toont eerst het inlogscherm en wisselt de code in; daarna gewoon naar de app
	onMount(() => void goto('/', { replaceState: true }));
</script>

<svelte:head><title>Uitnodiging · BetterOV</title></svelte:head>
