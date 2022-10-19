import child_process from 'child_process'

const args = [ 'start' ];
const opts = { stdio: 'inherit', cwd: '../webapp', shell: true };
child_process.spawn('npm', args, opts);
