declare const airglow: any;

// Allow iframing Google Calendar month view inside Gmail
airglow.platform.allowIframes(['calendar.google.com'], ['mail.google.com']);

export {}; // module scope so `declare const airglow` doesn't clash with the global in airglow.d.ts
