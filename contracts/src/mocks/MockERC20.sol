// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    /// @notice 部署可配置精度的测试 ERC20 代币。
    /// @dev 用于单元测试或本地模拟环境，允许自定义名称、符号与小数位。
    /// @param name_ 代币名称。
    /// @param symbol_ 代币符号。
    /// @param decimals_ 小数位精度。
    /// @custom:error 无
    /// @custom:example 测试中部署 `new MockERC20("Mock", "MCK", 18)`。
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    /// @notice 返回代币精度设置。
    /// @dev 覆盖 OpenZeppelin 默认实现，使用构造函数传入的小数位数。
    /// @return tokenDecimals 小数位精度。
    /// @custom:error 无
    /// @custom:example 调用 `token.decimals()` 验证模拟资产的单位。
    function decimals() public view override returns (uint8 tokenDecimals) {
        return _decimals;
    }

    /// @notice 铸造指定数量的测试代币给目标地址。
    /// @dev 仅用于测试场景，不做权限限制。
    /// @param to 接收新铸代币的钱包地址。
    /// @param amount 铸造数量。
    /// @custom:error 无
    /// @custom:example 管理员在测试中调用 `mint(user, 1e18)` 注入流动性。
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
