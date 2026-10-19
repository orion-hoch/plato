import path from 'node:path';

export class CodexError extends Error {
  constructor(status,message){super(message);this.status=status;}
}

// Keep credentials with the CLI. In particular, never forward API keys or app secrets.
export function cliEnvironment(env=process.env){
  return Object.fromEntries(['HOME','USER','LOGNAME','PATH','TMPDIR','CODEX_HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','LANG','LC_ALL','SSL_CERT_FILE','SSL_CERT_DIR'].filter(key=>env[key]).map(key=>[key,env[key]]));
}

export function cliArguments(directory,model='gpt-6-luna'){
  const disabled=['shell_tool','unified_exec','apps','plugins','remote_plugin','multi_agent','multi_agent_v2','browser_use','browser_use_external','computer_use','image_generation','view_image','memories','hooks','goals','shell_snapshot','workspace_dependencies','skill_search','skill_mcp_dependency_install','sleep_tool'];
  const configs={approval_policy:'never',web_search:'disabled',model_reasoning_effort:'low',forced_login_method:'chatgpt',project_doc_max_bytes:0,include_apps_instructions:false,include_collaboration_mode_instructions:false,include_environment_context:false,'skills.include_instructions':false,'skills.bundled.enabled':false,'tools.update_plan.enabled':false,'tools.experimental_request_user_input.enabled':false,'features.skip_host_skill_discovery':true,model_instructions_file:path.join(directory,'instructions.txt')};
  return ['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--model',model,'--sandbox','read-only','--cd',directory,'--color','never','--json','--output-schema',path.join(directory,'schema.json'),'--output-last-message',path.join(directory,'result.json'),...disabled.flatMap(flag=>['--disable',flag]),...Object.entries(configs).flatMap(([key,value])=>['-c',`${key}=${JSON.stringify(value)}`]),'-'];
}
