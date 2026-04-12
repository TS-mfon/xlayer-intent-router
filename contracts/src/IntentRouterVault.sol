// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract IntentRouterVault {
    struct Intent {
        address owner;
        address tokenIn;
        address tokenOut;
        address router;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 deadline;
        bytes32 quoteHash;
        bool cancelled;
        bool executed;
    }

    address public owner;
    address public agentWallet;
    bool public paused;
    uint256 public nextIntentId;

    mapping(address => bool) public allowedRouters;
    mapping(uint256 => Intent) public intents;

    event IntentCreated(
        uint256 indexed intentId,
        address indexed owner,
        address indexed tokenIn,
        address tokenOut,
        address router,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        bytes32 quoteHash
    );
    event IntentCancelled(uint256 indexed intentId, address indexed owner);
    event IntentExecuted(uint256 indexed intentId, address indexed owner, uint256 amountOut);
    event AgentWalletUpdated(address indexed oldAgentWallet, address indexed newAgentWallet);
    event RouterAllowlistUpdated(address indexed router, bool allowed);
    event PausedUpdated(bool paused);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error RouterNotAllowed();
    error Paused();
    error Expired();
    error AlreadyFinalized();
    error SlippageExceeded();
    error TokenTransferFailed();
    error RouterCallFailed(bytes data);

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    modifier whenNotPaused() {
        _whenNotPaused();
        _;
    }

    constructor(address initialAgentWallet) {
        owner = msg.sender;
        agentWallet = initialAgentWallet;
        emit OwnershipTransferred(address(0), msg.sender);
        emit AgentWalletUpdated(address(0), initialAgentWallet);
    }

    function createIntent(
        address tokenIn,
        address tokenOut,
        address router,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        bytes32 quoteHash
    ) external whenNotPaused returns (uint256 intentId) {
        if (tokenIn == address(0) || tokenOut == address(0) || router == address(0)) {
            revert InvalidAddress();
        }
        if (amountIn == 0 || minAmountOut == 0) revert InvalidAmount();
        if (!allowedRouters[router]) revert RouterNotAllowed();
        if (deadline < block.timestamp) revert Expired();

        if (!IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn)) {
            revert TokenTransferFailed();
        }

        intentId = ++nextIntentId;
        intents[intentId] = Intent({
            owner: msg.sender,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            router: router,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            deadline: deadline,
            quoteHash: quoteHash,
            cancelled: false,
            executed: false
        });

        emit IntentCreated(
            intentId, msg.sender, tokenIn, tokenOut, router, amountIn, minAmountOut, deadline, quoteHash
        );
    }

    function cancelIntent(uint256 intentId) external {
        Intent storage intent = intents[intentId];
        if (msg.sender != intent.owner) revert Unauthorized();
        if (intent.cancelled || intent.executed) revert AlreadyFinalized();
        intent.cancelled = true;
        if (!IERC20(intent.tokenIn).transfer(intent.owner, intent.amountIn)) revert TokenTransferFailed();
        emit IntentCancelled(intentId, msg.sender);
    }

    function executeIntent(uint256 intentId, bytes calldata routerCalldata)
        external
        whenNotPaused
        returns (uint256 amountOut)
    {
        if (msg.sender != agentWallet) revert Unauthorized();

        Intent storage intent = intents[intentId];
        if (intent.cancelled || intent.executed) revert AlreadyFinalized();
        if (block.timestamp > intent.deadline) revert Expired();
        if (!allowedRouters[intent.router]) revert RouterNotAllowed();

        uint256 beforeOut = IERC20(intent.tokenOut).balanceOf(address(this));
        if (!IERC20(intent.tokenIn).approve(intent.router, 0)) revert TokenTransferFailed();
        if (!IERC20(intent.tokenIn).approve(intent.router, intent.amountIn)) revert TokenTransferFailed();

        (bool ok, bytes memory data) = intent.router.call(routerCalldata);
        if (!ok) revert RouterCallFailed(data);

        if (!IERC20(intent.tokenIn).approve(intent.router, 0)) revert TokenTransferFailed();

        amountOut = IERC20(intent.tokenOut).balanceOf(address(this)) - beforeOut;
        if (amountOut < intent.minAmountOut) revert SlippageExceeded();

        intent.executed = true;
        if (!IERC20(intent.tokenOut).transfer(intent.owner, amountOut)) revert TokenTransferFailed();

        emit IntentExecuted(intentId, intent.owner, amountOut);
    }

    function setAgentWallet(address newAgentWallet) external onlyOwner {
        address oldAgentWallet = agentWallet;
        agentWallet = newAgentWallet;
        emit AgentWalletUpdated(oldAgentWallet, newAgentWallet);
    }

    function setRouterAllowed(address router, bool allowed) external onlyOwner {
        if (router == address(0)) revert InvalidAddress();
        allowedRouters[router] = allowed;
        emit RouterAllowlistUpdated(router, allowed);
    }

    function setPaused(bool newPaused) external onlyOwner {
        paused = newPaused;
        emit PausedUpdated(newPaused);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function _onlyOwner() internal view {
        if (msg.sender != owner) revert Unauthorized();
    }

    function _whenNotPaused() internal view {
        if (paused) revert Paused();
    }
}
