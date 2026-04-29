"""
Multi-Task Learning 모델: 패션 아이템의 질감, 패턴, 스타일을 동시에 분류

이 모델은 하나의 Backbone(공통 특징 추출기)을 사용하여
3가지 다른 태스크를 동시에 학습합니다:
- Material (재질): 97개 클래스 (학습용)
- Pattern (패턴): 70개 클래스 (학습용)
- Style (스타일): 8개 클래스

표시용으로는 재질 9개, 패턴 10개로 매핑됩니다.

Multi-Task Learning의 장점:
1. 공통 특징 추출: 하나의 Backbone이 모든 태스크에 공유되어 효율적
2. 상호 보완: 관련된 태스크들이 서로 도움을 주어 일반화 성능 향상
3. 계산 효율: 한 번의 Forward Pass로 3가지 예측 동시 수행
4. 데이터 효율: 각 태스크의 데이터를 모두 활용 가능
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision.models import efficientnet_b3, EfficientNet_B3_Weights


class FashionMTLModel(nn.Module):
    """
    Multi-Task Learning 모델 for Fashion Item Classification
    
    Architecture:
    - Backbone: EfficientNet-B3 (ImageNet pretrained, torchvision)
    - Shared Feature Extraction
    - 3 Independent Heads (Material/Texture, Pattern, Style)
    
    코랩 모델 구조와 호환되도록 설계됨:
    - backbone.features.* 구조 (torchvision EfficientNet)
    - shared 레이어 (shared_projection 아님)
    - material_head (texture_head 아님)
    """
    
    def __init__(self, num_texture_classes=97, num_pattern_classes=70, num_style_classes=8, dropout_rate=0.3, pretrained=True):
        """
        Args:
            num_texture_classes: 재질 클래스 수 (기본값: 97, 학습용)
            num_pattern_classes: 패턴 클래스 수 (기본값: 70, 학습용)
            num_style_classes: 스타일 클래스 수 (기본값: 8)
            dropout_rate: Dropout 비율 (기본값: 0.3)
            pretrained: ImageNet 사전 학습 가중치 사용 여부 (기본값: True)
        """
        super(FashionMTLModel, self).__init__()
        
        # ============================================
        # 1. Backbone: EfficientNet-B3 (torchvision)
        # ============================================
        # torchvision의 EfficientNet-B3 사용 (코랩 모델과 동일한 구조)
        # backbone.features.* 네이밍을 사용하여 체크포인트와 호환
        weights = EfficientNet_B3_Weights.IMAGENET1K_V1 if pretrained else None
        self.backbone = efficientnet_b3(weights=weights)
        
        # classifier 제거 -> feature vector 출력
        # EfficientNet-B3의 classifier는 마지막에 Linear 레이어가 있음
        in_features = self.backbone.classifier[1].in_features  # 1536
        self.backbone.classifier = nn.Identity()  # classifier 제거
        
        # ============================================
        # 2. Shared Feature Projection Layer
        # ============================================
        # 코랩 모델과 호환: shared (shared_projection 아님)
        # Backbone 출력(1536차원)을 512차원으로 프로젝션
        self.shared = nn.Sequential(
            nn.Linear(in_features, 512),  # (batch_size, 1536) -> (batch_size, 512)
            nn.ReLU(inplace=True),
            nn.Dropout(dropout_rate)
        )
        
        # ============================================
        # 3. Material Head (재질 분류)
        # ============================================
        # 재질 분류를 위한 독립적인 분류 헤드
        # 코랩 모델과 호환: material_head (texture_head 아님)
        # 
        # 저장된 모델 구조: Sequential (512 -> 512 -> 97)
        # - 0: Linear(512, 512) + ReLU + Dropout
        # - 3: Linear(97, 512) - 최종 분류 레이어
        self.material_head = nn.Sequential(
            nn.Linear(512, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout_rate),
            nn.Linear(512, num_texture_classes)  # (batch_size, 512) -> (batch_size, 97)
        )
        
        # ============================================
        # 4. Pattern Head (패턴 분류)
        # ============================================
        # 패턴 분류를 위한 독립적인 분류 헤드
        # 
        # 저장된 모델 구조: Sequential (512 -> 512 -> 70)
        self.pattern_head = nn.Sequential(
            nn.Linear(512, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout_rate),
            nn.Linear(512, num_pattern_classes)  # (batch_size, 512) -> (batch_size, 70)
        )
        
        # ============================================
        # 5. Style Head (스타일 분류)
        # ============================================
        # 스타일 분류를 위한 독립적인 분류 헤드
        # 
        # 저장된 모델 구조: Sequential (512 -> 512 -> 8)
        self.style_head = nn.Sequential(
            nn.Linear(512, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout_rate),
            nn.Linear(512, num_style_classes)  # (batch_size, 512) -> (batch_size, 8)
        )
    
    def forward(self, x):
        """
        Forward Pass: 입력 이미지에서 3가지 태스크의 예측을 동시에 수행
        
        Args:
            x: 입력 이미지 텐서
                Shape: (batch_size, 3, height, width)
                예: (32, 3, 224, 224) - 배치 크기 32, RGB 3채널, 224x224 크기
        
        Returns:
            style_logits: 스타일 분류 로짓
                Shape: (batch_size, 8)
            material_logits: 재질 분류 로짓
                Shape: (batch_size, 97)
            pattern_logits: 패턴 분류 로짓
                Shape: (batch_size, 70)
        
        Note: 코랩 모델과 호환을 위해 반환 순서가 (style, material, pattern)입니다.
        """
        # Step 1: Backbone을 통한 특징 추출
        # torchvision EfficientNet-B3는 classifier를 제거했으므로
        # 직접 feature vector를 출력합니다.
        feat = self.backbone(x)  # (batch_size, 1536)
        
        # Step 2: Shared Feature Projection
        feat = self.shared(feat)  # (batch_size, 512)
        
        # Step 3: Multi-Task 분기 (3개의 독립적인 Head)
        # 코랩 모델과 동일한 순서로 반환: (style, material, pattern)
        s = self.style_head(feat)      # (batch_size, 8)
        m = self.material_head(feat)   # (batch_size, 97)
        p = self.pattern_head(feat)    # (batch_size, 70)
        
        return s, m, p


# ============================================
# Total Loss 계산 예시 코드
# ============================================
def compute_total_loss(texture_logits, pattern_logits, style_logits,
                      texture_labels, pattern_labels, style_labels,
                      texture_weight=1.0, pattern_weight=1.0, style_weight=1.0):
    """
    Multi-Task Learning의 Total Loss 계산
    
    각 태스크의 Loss를 가중합하여 하나의 Total Loss로 통합합니다.
    이렇게 하면 하나의 Loss로 역전파가 가능해집니다.
    
    Args:
        texture_logits: 재질 분류 로짓
            Shape: (batch_size, 9)
        pattern_logits: 패턴 분류 로짓
            Shape: (batch_size, 10)
        style_logits: 스타일 분류 로짓
            Shape: (batch_size, 8)
        texture_labels: 재질 정답 레이블
            Shape: (batch_size,) - 각 샘플의 클래스 인덱스 (0~8)
        pattern_labels: 패턴 정답 레이블
            Shape: (batch_size,) - 각 샘플의 클래스 인덱스 (0~9)
        style_labels: 스타일 정답 레이블
            Shape: (batch_size,) - 각 샘플의 클래스 인덱스 (0~7)
        texture_weight: 재질 Loss의 가중치 (기본값: 1.0)
        pattern_weight: 패턴 Loss의 가중치 (기본값: 1.0)
        style_weight: 스타일 Loss의 가중치 (기본값: 1.0)
    
    Returns:
        total_loss: 총 Loss (스칼라 텐서)
        loss_dict: 각 태스크별 Loss를 담은 딕셔너리 (디버깅/모니터링용)
    """
    # Cross Entropy Loss 함수 생성
    # CrossEntropyLoss는 분류 문제에서 가장 많이 사용되는 Loss 함수
    # 내부적으로 다음을 수행:
    #   1. Logits에 Softmax 적용 → 확률로 변환
    #   2. Negative Log Likelihood 계산 → 정답 클래스의 확률에 -log 적용
    #   3. 배치 전체의 평균 계산
    criterion = nn.CrossEntropyLoss()
    
    # ============================================
    # Step 1: 각 태스크별 Loss 계산
    # ============================================
    # 각 태스크의 Loss를 독립적으로 계산
    # 이 Loss들은 나중에 가중합으로 합쳐짐
    
    # Texture Loss
    # texture_logits: (batch_size, 9) - 9개 재질 클래스에 대한 로짓
    # texture_labels: (batch_size,) - 정답 재질 클래스 인덱스 (0~8)
    # 
    # CrossEntropyLoss 동작:
    #   1. texture_logits에 Softmax 적용 → 각 클래스의 확률 계산
    #   2. 정답 클래스(texture_labels)의 확률에 -log 적용
    #   3. 배치 전체의 평균 계산
    # 
    # 예시:
    #   - texture_logits[0] = [2.1, 0.5, -0.3, 1.2, -1.0, 0.8, 0.3, -0.5, 0.1]
    #   - texture_labels[0] = 0 (Woven (Plain))
    #   - Softmax 후: [0.65, 0.12, 0.05, 0.10, 0.03, 0.05, 0.02, 0.01, 0.02]
    #   - Loss = -log(0.65) ≈ 0.43
    texture_loss = criterion(texture_logits, texture_labels)
    # 출력: 스칼라 텐서 (예: tensor(0.8234))
    # 배치 전체의 평균 Loss 값
    
    # Pattern Loss
    # pattern_logits: (batch_size, 10) - 10개 패턴 클래스에 대한 로짓
    # pattern_labels: (batch_size,) - 정답 패턴 클래스 인덱스 (0~9)
    # Texture Loss와 동일한 방식으로 계산
    pattern_loss = criterion(pattern_logits, pattern_labels)
    # 출력: 스칼라 텐서 (예: tensor(1.2345))
    # 패턴 분류의 평균 Loss 값
    
    # Style Loss
    # style_logits: (batch_size, 8) - 8개 스타일 클래스에 대한 로짓
    # style_labels: (batch_size,) - 정답 스타일 클래스 인덱스 (0~7)
    # Texture, Pattern Loss와 동일한 방식으로 계산
    style_loss = criterion(style_logits, style_labels)
    # 출력: 스칼라 텐서 (예: tensor(0.9876))
    # 스타일 분류의 평균 Loss 값
    
    # ============================================
    # Step 2: 가중합으로 Total Loss 계산
    # ============================================
    # 각 태스크의 Loss에 가중치를 곱하여 합산
    # 
    # 왜 가중합을 사용하는가?
    # - PyTorch는 하나의 스칼라 Loss만 역전파할 수 있음
    # - 3개 태스크의 Loss를 하나로 합쳐야 함
    # - 가중치를 통해 각 태스크의 중요도 조절 가능
    # 
    # 가중치 조정 예시:
    # - texture_weight=1.0, pattern_weight=1.0, style_weight=1.0: 동등한 중요도
    # - texture_weight=2.0: 재질 분류에 더 집중
    # - pattern_weight=0.5: 패턴 분류의 영향력 감소
    # 
    # 이렇게 하면 하나의 스칼라 Loss가 되어 역전파가 가능합니다.
    total_loss = (texture_weight * texture_loss + 
                  pattern_weight * pattern_loss + 
                  style_weight * style_loss)
    # 예: 1.0 * 0.8234 + 1.0 * 1.2345 + 1.0 * 0.9876 = 3.0455
    # 
    # 역전파 시:
    # - total_loss.backward()를 호출하면
    # - 3개 태스크의 Loss가 모두 역전파됨
    # - Backbone, Shared Projection, 각 Head의 파라미터가 모두 업데이트됨
    
    # 디버깅/모니터링을 위한 Loss 딕셔너리
    loss_dict = {
        'texture_loss': texture_loss.item(),
        'pattern_loss': pattern_loss.item(),
        'style_loss': style_loss.item(),
        'total_loss': total_loss.item()
    }
    
    return total_loss, loss_dict


# ============================================
# 학습 루프 예시 코드
# ============================================
def training_loop_example():
    """
    학습 루프 예시 코드
    
    이 함수는 실제 학습 코드의 구조를 보여줍니다.
    실제 사용 시에는 데이터로더와 함께 사용하세요.
    """
    # 모델 초기화
    model = FashionMTLModel(
        num_texture_classes=9,
        num_pattern_classes=10,
        num_style_classes=8,
        dropout_rate=0.3
    )
    
    # GPU 사용 가능 시 GPU로 이동
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = model.to(device)
    
    # 옵티마이저 설정
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    
    # 학습 모드 설정
    model.train()
    
    # 더미 데이터 (실제로는 DataLoader에서 가져옴)
    batch_size = 32
    dummy_images = torch.randn(batch_size, 3, 224, 224).to(device)
    # Shape: (32, 3, 224, 224)
    
    dummy_texture_labels = torch.randint(0, 9, (batch_size,)).to(device)
    # Shape: (32,) - 각 샘플의 재질 클래스 (0~8)
    
    dummy_pattern_labels = torch.randint(0, 10, (batch_size,)).to(device)
    # Shape: (32,) - 각 샘플의 패턴 클래스 (0~9)
    
    dummy_style_labels = torch.randint(0, 8, (batch_size,)).to(device)
    # Shape: (32,) - 각 샘플의 스타일 클래스 (0~7)
    
    # Forward Pass
    texture_logits, pattern_logits, style_logits = model(dummy_images)
    # texture_logits: (32, 6)
    # pattern_logits: (32, 10)
    # style_logits: (32, 8)
    
    # Loss 계산
    total_loss, loss_dict = compute_total_loss(
        texture_logits, pattern_logits, style_logits,
        dummy_texture_labels, dummy_pattern_labels, dummy_style_labels,
        texture_weight=1.0, pattern_weight=1.0, style_weight=1.0
    )
    
    # Backward Pass
    optimizer.zero_grad()  # 기울기 초기화
    total_loss.backward()  # 역전파 (3개 태스크의 Loss가 모두 역전파됨)
    optimizer.step()  # 파라미터 업데이트
    
    # Loss 출력
    print(f"Total Loss: {loss_dict['total_loss']:.4f}")
    print(f"  - Texture Loss: {loss_dict['texture_loss']:.4f}")
    print(f"  - Pattern Loss: {loss_dict['pattern_loss']:.4f}")
    print(f"  - Style Loss: {loss_dict['style_loss']:.4f}")


if __name__ == "__main__":
    # 모델 테스트
    print("=" * 60)
    print("Fashion MTL Model Test")
    print("=" * 60)
    
    # 모델 생성
    model = FashionMTLModel()
    
    # 더미 입력 생성
    batch_size = 4
    dummy_input = torch.randn(batch_size, 3, 224, 224)
    print(f"\n입력 Shape: {dummy_input.shape}")
    
    # Forward Pass
    model.eval()
    with torch.no_grad():
        texture_logits, pattern_logits, style_logits = model(dummy_input)
    
    print(f"\n출력 Shapes:")
    print(f"  - Texture Logits: {texture_logits.shape}")
    print(f"  - Pattern Logits: {pattern_logits.shape}")
    print(f"  - Style Logits: {style_logits.shape}")
    
    # 모델 파라미터 수 계산
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\n모델 파라미터:")
    print(f"  - 총 파라미터 수: {total_params:,}")
    print(f"  - 학습 가능 파라미터 수: {trainable_params:,}")
    
    print("\n" + "=" * 60)
    print("모델 구조:")
    print("=" * 60)
    print(model)

