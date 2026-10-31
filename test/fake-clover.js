// A stand-in for the clover CLI, for tests that must not reach a cloud: CLOVER_CLI=test/fake-clover.js
//   clover gcp whoami  answers like the real one, from GOOGLE_CLOUD_PROJECT (the project "denied" is rejected)
//   clover <any> env   prints the credential variables it was started with, as JSON
const [provider, action] = process.argv.slice(2);

if (action === 'env') {
    const vars = Object.entries(process.env).filter(([name]) => /^(AWS|GOOGLE)_/.test(name));
    console.log(JSON.stringify(Object.fromEntries(vars)));
} else if (provider === 'gcp' && action === 'whoami') {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project || project === 'denied') {
        console.error('Could not load the default credentials.');
        process.exitCode = 1;
    } else {
        const who = process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'clover@my-project.iam.gserviceaccount.com' : 'application default credentials';
        console.log(`${who} (project ${project})`);
    }
} else {
    console.error(`fake-clover: no answer for ${process.argv.slice(2).join(' ')}`);
    process.exitCode = 1;
}
