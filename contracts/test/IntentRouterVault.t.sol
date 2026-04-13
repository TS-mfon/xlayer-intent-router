// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {IntentRouterVault} from "../src/IntentRouterVault.sol";

interface Vm {
    function deal(address account, uint256 amount) external;
    function expectRevert(bytes4 selector) external;
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
}

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockRouter {
    MockERC20 public inToken;
    MockERC20 public outToken;
    uint256 public amountOut;

    constructor(MockERC20 inToken_, MockERC20 outToken_, uint256 amountOut_) {
        inToken = inToken_;
        outToken = outToken_;
        amountOut = amountOut_;
    }

    function swap() external {
        inToken.transferFrom(msg.sender, address(this), 10 ether);
        outToken.mint(msg.sender, amountOut);
    }
}

contract MockNativeRouter {
    MockERC20 public outToken;
    uint256 public amountOut;
    uint256 public amountIn;

    constructor(MockERC20 outToken_, uint256 amountIn_, uint256 amountOut_) {
        outToken = outToken_;
        amountIn = amountIn_;
        amountOut = amountOut_;
    }

    function swapNative() external payable {
        require(msg.value == amountIn, "native amount");
        outToken.mint(msg.sender, amountOut);
    }
}

contract IntentRouterVaultTest {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address internal user = address(0xA11CE);
    address internal agent = address(0xA6E17);
    MockERC20 internal tokenIn;
    MockERC20 internal tokenOut;
    MockRouter internal router;
    MockNativeRouter internal nativeRouter;
    IntentRouterVault internal vault;

    function setUp() public {
        tokenIn = new MockERC20("Test OKB", "tOKB");
        tokenOut = new MockERC20("Test USDT", "tUSDT");
        router = new MockRouter(tokenIn, tokenOut, 90 ether);
        nativeRouter = new MockNativeRouter(tokenOut, 10 ether, 90 ether);
        vault = new IntentRouterVault(agent);
        vault.setRouterAllowed(address(router), true);
        vault.setRouterAllowed(address(nativeRouter), true);
        tokenIn.mint(user, 100 ether);
        VM.deal(user, 100 ether);
        VM.prank(user);
        tokenIn.approve(address(vault), 100 ether);
        VM.warp(100);
    }

    function testCreateIntent() public {
        VM.prank(user);
        uint256 intentId = vault.createIntent(
            address(tokenIn),
            address(tokenOut),
            address(router),
            10 ether,
            80 ether,
            1_000,
            keccak256("quote")
        );

        assertEq(intentId, 1);
        assertEq(tokenIn.balanceOf(address(vault)), 10 ether);
    }

    function testOnlyAgentCanExecute() public {
        uint256 intentId = createDefaultIntent(80 ether);
        VM.expectRevert(IntentRouterVault.Unauthorized.selector);
        vault.executeIntent(intentId, abi.encodeCall(MockRouter.swap, ()));
    }

    function testExecutesIntentAndTransfersOutput() public {
        uint256 intentId = createDefaultIntent(80 ether);
        VM.prank(agent);
        uint256 amountOut = vault.executeIntent(intentId, abi.encodeCall(MockRouter.swap, ()));

        assertEq(amountOut, 90 ether);
        assertEq(tokenOut.balanceOf(user), 90 ether);
    }

    function testCreatesNativeIntent() public {
        uint256 intentId = createNativeIntent(80 ether);
        assertEq(intentId, 1);
        assertEq(address(vault).balance, 10 ether);
    }

    function testExecutesNativeIntentAndTransfersOutput() public {
        uint256 intentId = createNativeIntent(80 ether);
        VM.prank(agent);
        uint256 amountOut = vault.executeIntent(intentId, abi.encodeCall(MockNativeRouter.swapNative, ()));

        assertEq(amountOut, 90 ether);
        assertEq(tokenOut.balanceOf(user), 90 ether);
        assertEq(address(vault).balance, 0);
    }

    function testRejectsSlippage() public {
        uint256 intentId = createDefaultIntent(95 ether);
        VM.prank(agent);
        VM.expectRevert(IntentRouterVault.SlippageExceeded.selector);
        vault.executeIntent(intentId, abi.encodeCall(MockRouter.swap, ()));
    }

    function testCancelsIntentAndRefunds() public {
        uint256 intentId = createDefaultIntent(80 ether);
        VM.prank(user);
        vault.cancelIntent(intentId);
        assertEq(tokenIn.balanceOf(user), 100 ether);
    }

    function testCancelsNativeIntentAndRefunds() public {
        uint256 intentId = createNativeIntent(80 ether);
        VM.prank(user);
        vault.cancelIntent(intentId);
        assertEq(user.balance, 100 ether);
        assertEq(address(vault).balance, 0);
    }

    function testRejectsExpiredIntent() public {
        uint256 intentId = createDefaultIntent(80 ether);
        VM.warp(1_001);
        VM.prank(agent);
        VM.expectRevert(IntentRouterVault.Expired.selector);
        vault.executeIntent(intentId, abi.encodeCall(MockRouter.swap, ()));
    }

    function createDefaultIntent(uint256 minAmountOut) internal returns (uint256) {
        VM.prank(user);
        return vault.createIntent(
            address(tokenIn),
            address(tokenOut),
            address(router),
            10 ether,
            minAmountOut,
            1_000,
            keccak256("quote")
        );
    }

    function createNativeIntent(uint256 minAmountOut) internal returns (uint256) {
        VM.prank(user);
        return vault.createIntent{value: 10 ether}(
            NATIVE_TOKEN,
            address(tokenOut),
            address(nativeRouter),
            10 ether,
            minAmountOut,
            1_000,
            keccak256("quote")
        );
    }

    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "not equal");
    }
}
