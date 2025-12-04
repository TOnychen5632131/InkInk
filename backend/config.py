import logging
import os
import yaml
from pathlib import Path

logger = logging.getLogger(__name__)


class Config:
    DEBUG = os.getenv("DEBUG", "true").lower() == "true"
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", "12398"))
    CORS_ORIGINS = [
        origin.strip() for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://localhost:3000"
        ).split(",") if origin.strip()
    ]
    OUTPUT_DIR = os.getenv("OUTPUT_DIR", "output")
    DATA_DIR = os.getenv("APP_DATA_DIR")

    _image_providers_config = None
    _text_providers_config = None
    _resolved_history_dir: Path | None = None

    @classmethod
    def get_history_dir(cls) -> Path:
        """
        返回可写的历史/输出目录。
        - 优先 APP_DATA_DIR 环境变量
        - 其次项目内 history 目录（若可写）
        - 最后回退到 /tmp/inkink-history
        """
        if cls._resolved_history_dir is not None:
            return cls._resolved_history_dir

        candidates = []
        if cls.DATA_DIR:
            candidates.append(Path(cls.DATA_DIR))
        candidates.append(Path(__file__).parent.parent / "history")
        candidates.append(Path("/tmp/inkink-history"))

        for path in candidates:
            try:
                path.mkdir(parents=True, exist_ok=True)
                cls._resolved_history_dir = path
                logger.info(f"历史目录使用: {path}")
                break
            except Exception as e:
                logger.warning(f"历史目录不可写: {path} ({e})")

        if cls._resolved_history_dir is None:
            raise RuntimeError("无法创建历史目录，请检查权限或 APP_DATA_DIR 设置")

        return cls._resolved_history_dir

    @classmethod
    def load_image_providers_config(cls):
        if cls._image_providers_config is not None:
            return cls._image_providers_config

        env_yaml = os.getenv("IMAGE_PROVIDERS_YAML")
        config_path = Path(__file__).parent.parent / 'image_providers.yaml'
        logger.debug(f"加载图片服务商配置: {config_path} (或 IMAGE_PROVIDERS_YAML 环境变量)")

        if env_yaml:
            try:
                cls._image_providers_config = yaml.safe_load(env_yaml) or {}
                logger.debug("图片配置加载成功（来自环境变量）")
                return cls._image_providers_config
            except yaml.YAMLError as e:
                logger.error(f"图片配置环境变量 YAML 格式错误: {e}")
                raise ValueError(f"IMAGE_PROVIDERS_YAML 解析失败: {e}")

        if not config_path.exists():
            logger.warning(f"图片配置文件不存在: {config_path}，使用默认配置")
            cls._image_providers_config = {
                'active_provider': 'google_genai',
                'providers': {}
            }
            return cls._image_providers_config

        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                cls._image_providers_config = yaml.safe_load(f) or {}
            logger.debug(f"图片配置加载成功: {list(cls._image_providers_config.get('providers', {}).keys())}")
        except yaml.YAMLError as e:
            logger.error(f"图片配置文件 YAML 格式错误: {e}")
            raise ValueError(
                f"配置文件格式错误: image_providers.yaml\n"
                f"YAML 解析错误: {e}\n"
                "解决方案：\n"
                "1. 检查 YAML 缩进是否正确（使用空格，不要用Tab）\n"
                "2. 检查引号是否配对\n"
                "3. 使用在线 YAML 验证器检查格式"
            )

        return cls._image_providers_config

    @classmethod
    def load_text_providers_config(cls):
        """加载文本生成服务商配置"""
        if cls._text_providers_config is not None:
            return cls._text_providers_config

        env_yaml = os.getenv("TEXT_PROVIDERS_YAML")
        config_path = Path(__file__).parent.parent / 'text_providers.yaml'
        logger.debug(f"加载文本服务商配置: {config_path} (或 TEXT_PROVIDERS_YAML 环境变量)")

        if env_yaml:
            try:
                cls._text_providers_config = yaml.safe_load(env_yaml) or {}
                logger.debug("文本配置加载成功（来自环境变量）")
                return cls._text_providers_config
            except yaml.YAMLError as e:
                logger.error(f"文本配置环境变量 YAML 格式错误: {e}")
                raise ValueError(f"TEXT_PROVIDERS_YAML 解析失败: {e}")

        if not config_path.exists():
            logger.warning(f"文本配置文件不存在: {config_path}，使用默认配置")
            cls._text_providers_config = {
                'active_provider': 'google_gemini',
                'providers': {}
            }
            return cls._text_providers_config

        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                cls._text_providers_config = yaml.safe_load(f) or {}
            logger.debug(f"文本配置加载成功: {list(cls._text_providers_config.get('providers', {}).keys())}")
        except yaml.YAMLError as e:
            logger.error(f"文本配置文件 YAML 格式错误: {e}")
            raise ValueError(
                f"配置文件格式错误: text_providers.yaml\n"
                f"YAML 解析错误: {e}\n"
                "解决方案：\n"
                "1. 检查 YAML 缩进是否正确（使用空格，不要用Tab）\n"
                "2. 检查引号是否配对\n"
                "3. 使用在线 YAML 验证器检查格式"
            )

        return cls._text_providers_config

    @classmethod
    def get_active_image_provider(cls):
        config = cls.load_image_providers_config()
        active = config.get('active_provider', 'google_genai')
        logger.debug(f"当前激活的图片服务商: {active}")
        return active

    @classmethod
    def get_image_provider_config(cls, provider_name: str = None):
        config = cls.load_image_providers_config()

        if provider_name is None:
            provider_name = cls.get_active_image_provider()

        logger.info(f"获取图片服务商配置: {provider_name}")

        providers = config.get('providers', {})
        if not providers:
            raise ValueError(
                "未找到任何图片生成服务商配置。\n"
                "解决方案：\n"
                "1. 在系统设置页面添加图片生成服务商\n"
                "2. 或手动编辑 image_providers.yaml 文件\n"
                "3. 确保文件中有 providers 字段"
            )

        if provider_name not in providers:
            available = ', '.join(providers.keys()) if providers else '无'
            logger.error(f"图片服务商 [{provider_name}] 不存在，可用服务商: {available}")
            raise ValueError(
                f"未找到图片生成服务商配置: {provider_name}\n"
                f"可用的服务商: {available}\n"
                "解决方案：\n"
                "1. 在系统设置页面添加该服务商\n"
                "2. 或修改 active_provider 为已存在的服务商\n"
                "3. 检查 image_providers.yaml 文件"
            )

        provider_config = providers[provider_name].copy()

        # 验证必要字段
        if not provider_config.get('api_key'):
            logger.error(f"图片服务商 [{provider_name}] 未配置 API Key")
            raise ValueError(
                f"服务商 {provider_name} 未配置 API Key\n"
                "解决方案：\n"
                "1. 在系统设置页面编辑该服务商，填写 API Key\n"
                "2. 或手动在 image_providers.yaml 中添加 api_key 字段"
            )

        provider_type = provider_config.get('type', provider_name)
        if provider_type in ['openai', 'openai_compatible', 'image_api']:
            if not provider_config.get('base_url'):
                logger.error(f"服务商 [{provider_name}] 类型为 {provider_type}，但未配置 base_url")
                raise ValueError(
                    f"服务商 {provider_name} 未配置 Base URL\n"
                    f"服务商类型 {provider_type} 需要配置 base_url\n"
                    "解决方案：在系统设置页面编辑该服务商，填写 Base URL"
                )

        logger.info(f"图片服务商配置验证通过: {provider_name} (type={provider_type})")
        return provider_config

    @classmethod
    def reload_config(cls):
        """重新加载配置（清除缓存）"""
        logger.info("重新加载所有配置...")
        cls._image_providers_config = None
        cls._text_providers_config = None
