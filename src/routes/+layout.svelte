<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	let { children } = $props();

	// Load Google Identity Services script
	if (browser) {
		const script = document.createElement('script');
		script.src = 'https://accounts.google.com/gsi/client';
		script.async = true;
		script.defer = true;
		document.head.appendChild(script);
	}
</script>

{@render children()}
