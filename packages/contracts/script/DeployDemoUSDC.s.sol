// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Script, console2} from "forge-std/Script.sol";

/// @notice Optional demo token when a routed Sepolia USDC is not used.
contract DemoUSDC is ERC20 {
    constructor() ERC20("Brew Demo USDC", "bUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

/// @notice Deploys DemoUSDC and mints it to the configured demo recipient.
contract DeployDemoUSDC is Script {
    uint256 internal constant MINT_AMOUNT = 100_000 * 1e6;

    function run() external returns (DemoUSDC token) {
        address deployer = _keystoreSigner();
        address recipient = _optionalAddress("DEMO_TOKEN_RECIPIENT");
        if (recipient == address(0)) {
            recipient = deployer;
        }

        vm.startBroadcast();
        token = new DemoUSDC();
        token.mint(recipient, MINT_AMOUNT);
        vm.stopBroadcast();

        console2.log("DEMO_TOKEN_ADDRESS=%s", address(token));
        console2.log("BREW_DEPLOYER_ADDRESS=%s", deployer);
        console2.log("DEMO_TOKEN_RECIPIENT=%s", recipient);
        console2.log("MINT_AMOUNT=%s", MINT_AMOUNT);
    }

    function _keystoreSigner() internal view returns (address) {
        address[] memory wallets = vm.getWallets();
        require(wallets.length == 1, "expected one keystore signer");

        return wallets[0];
    }

    function _optionalAddress(string memory name) internal view returns (address) {
        if (!vm.envExists(name)) {
            return address(0);
        }

        string memory raw = vm.envString(name);
        bytes memory value = bytes(raw);
        if (value.length == 0 || value.length == 2) {
            return address(0);
        }
        if (value.length < 2 || value[0] != 0x30 || (value[1] != 0x78 && value[1] != 0x58)) {
            return address(0);
        }

        return vm.parseAddress(raw);
    }
}
