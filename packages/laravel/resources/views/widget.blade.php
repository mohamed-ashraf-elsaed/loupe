{{-- Loupe widget bootstrap. Rendered by @loupeWidget only for authorized users. --}}
<script src="{{ asset('vendor/loupe/sdk/loupe.js') }}"></script>
<script>
    (function () {
        if (!window.Loupe || typeof window.Loupe.init !== 'function') return;
        window.Loupe.init({
            projectKey: @json($projectKey),
            user: @json($user),
            apiBase: @json($apiBase),
            headers: { 'X-CSRF-TOKEN': @json($csrf) },
            credentials: 'same-origin',
        });
    })();
</script>
