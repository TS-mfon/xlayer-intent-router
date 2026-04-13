// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {IntentRouterVault} from "../src/IntentRouterVault.sol";

interface Vm {
    function envAddress(string calldata key) external view returns (address);
    function envUint(string calldata key) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract Deploy {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (IntentRouterVault vault) {
        address agentWallet = VM.envAddress("AGENT_WALLET_ADDRESS");
        uint256 privateKey = VM.envUint("PRIVATE_KEY");
        VM.startBroadcast(privateKey);
        vault = new IntentRouterVault(agentWallet);
        VM.stopBroadcast();
    }
}
