import * as vscode from "vscode";

function cfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("trellis");
}

export function getAgentCommand(): string {
  return cfg().get<string>("agentCommand", "claude");
}


export function getAutoLaunchOnOpen(): boolean {
  return cfg().get<boolean>("autoLaunchOnOpen", false);
}
